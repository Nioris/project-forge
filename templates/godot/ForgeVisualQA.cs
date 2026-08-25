using Godot;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

/// <summary>Project Forge native visual adapter. Inert unless --forge-visual-mode is present.</summary>
public partial class ForgeVisualQA : Node
{
    private const string Protocol = "forge-godot-visual-v1";
    private readonly Dictionary<string, string> _options = new(StringComparer.Ordinal);
    private Node? _target;
    private bool _proofActive;
    private int _proofFrame;
    private int _proofTotalFrames;
    private int _proofFps = 30;
    private string[] _proofStates = System.Array.Empty<string>();
    private int _proofStateIndex = -1;
    private string _proofSamplesDir = "";
    private int _proofExpectedSamples;
    private int _proofSamplesWritten;
    private bool _proofSampleInFlight;
    private bool _proofSimulationComplete;
    private bool _proofFinalDrawSeen;
    private bool _proofTerminal;
    private int _proofWidth;
    private int _proofHeight;

    public override void _Ready()
    {
        foreach (var argument in OS.GetCmdlineUserArgs())
        {
            if (!argument.StartsWith("--forge-", StringComparison.Ordinal)) continue;
            var separator = argument.IndexOf('=');
            if (separator <= 2) continue;
            _options[argument.Substring(2, separator - 2)] = argument[(separator + 1)..];
        }
        if (!_options.ContainsKey("forge-visual-mode")) { SetProcess(false); return; }
        Callable.From(StartVisualRun).CallDeferred();
    }

    private async void StartVisualRun()
    {
        await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
        _target = GetTree().CurrentScene;
        var targetPath = Option("forge-visual-target", ".");
        if (targetPath != "." && _target != null) _target = _target.GetNodeOrNull(new NodePath(targetPath));
        if (_target == null) { Fail($"target node is unavailable: {targetPath}"); return; }
        foreach (var method in new[] { "forge_visual_states", "forge_visual_show_state", "forge_visual_current_state", "forge_visual_tick_proof" })
        {
            if (!_target.HasMethod(method)) { Fail($"target node lacks required method: {method}"); return; }
        }
        GD.Print($"FORGE_VISUAL_PROTOCOL:{Protocol}");
        var mode = Option("forge-visual-mode", "");
        if (mode == "capture") await CaptureState();
        else if (mode == "proof") StartProof();
        else Fail($"unsupported mode: {mode}");
    }

    private string Option(string key, string fallback) => _options.TryGetValue(key, out var value) ? value : fallback;

    private bool TryOptionInt(string key, string fallback, out int value)
    {
        if (int.TryParse(Option(key, fallback), out value)) return true;
        Fail($"invalid integer option: {key}");
        return false;
    }

    private HashSet<string> DeclaredStates()
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        if (_target == null) return result;
        Godot.Collections.Array values = _target.Call("forge_visual_states").AsGodotArray();
        foreach (Variant value in values) result.Add(value.AsString());
        return result;
    }

    private bool ShowState(string state)
    {
        if (_target == null || !DeclaredStates().Contains(state)) { Fail($"adapter did not declare state: {state}"); return false; }
        _target.Call("forge_visual_show_state", state);
        return true;
    }

    private async Task CaptureState()
    {
        var state = Option("forge-visual-state", "");
        var output = Option("forge-visual-output", "");
        if (!TryOptionInt("forge-visual-settle-frames", "6", out var settleFrames)) return;
        settleFrames = Math.Clamp(settleFrames, 2, 120);
        if (string.IsNullOrEmpty(state) || string.IsNullOrEmpty(output)) { Fail("capture state/output is missing"); return; }
        if (!ShowState(state)) return;
        for (var frame = 0; frame < settleFrames; frame++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
        var reported = _target!.Call("forge_visual_current_state").AsString();
        if (reported != state) { Fail($"requested state {state} but adapter reported {reported}"); return; }
        await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
        var image = GetViewport().GetTexture().GetImage();
        if (!TryOptionInt("forge-visual-width", "0", out var expectedWidth)
            || !TryOptionInt("forge-visual-height", "0", out var expectedHeight)) return;
        if (image == null || image.IsEmpty()) { Fail("viewport returned an empty image"); return; }
        if (image.GetWidth() != expectedWidth || image.GetHeight() != expectedHeight)
        {
            Fail($"viewport image is {image.GetWidth()}x{image.GetHeight()}, expected {expectedWidth}x{expectedHeight}"); return;
        }
        var directory = Path.GetDirectoryName(output);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var saveError = image.SavePng(output);
        if (saveError != Error.Ok) { Fail($"save_png failed: {saveError}"); return; }
        GD.Print($"FORGE_VISUAL_STATE:{reported}");
        GD.Print($"FORGE_VISUAL_CAPTURED:{output}");
        GetTree().Quit(0);
    }

    private void StartProof()
    {
        _proofStates = Option("forge-proof-states", "").Split(',', StringSplitOptions.RemoveEmptyEntries);
        if (!TryOptionInt("forge-proof-total-frames", "0", out _proofTotalFrames)
            || !TryOptionInt("forge-proof-fps", "30", out _proofFps)
            || !TryOptionInt("forge-visual-width", "0", out _proofWidth)
            || !TryOptionInt("forge-visual-height", "0", out _proofHeight)) return;
        _proofSamplesDir = Option("forge-proof-samples-dir", "");
        if (_proofFps <= 0 || _proofTotalFrames % _proofFps != 0) { Fail("proof total frames must contain a whole number of seconds"); return; }
        var durationSeconds = _proofTotalFrames / _proofFps;
        if (_proofStates.Length < 2 || durationSeconds < 15 || durationSeconds > 20) { Fail("proof plan must contain 2+ states and last 15 to 20 seconds"); return; }
        if (string.IsNullOrEmpty(_proofSamplesDir) || !Path.IsPathFullyQualified(_proofSamplesDir) || _proofWidth <= 0 || _proofHeight <= 0)
        {
            Fail("proof samples directory or viewport dimensions are missing"); return;
        }
        try { Directory.CreateDirectory(_proofSamplesDir); }
        catch (Exception error) { Fail($"cannot create proof samples directory: {error.Message}"); return; }
        foreach (var state in _proofStates) if (!DeclaredStates().Contains(state)) { Fail($"adapter did not declare proof state: {state}"); return; }
        _proofExpectedSamples = durationSeconds;
        _proofActive = true;
        SetProcess(true);
        GD.Print($"FORGE_VISUAL_PROOF_READY:{_proofTotalFrames}:{_proofFps}");
    }

    public override void _Process(double delta)
    {
        if (!_proofActive || _proofSimulationComplete || _target == null) return;
        var segmentFrames = Math.Max(1, (int)Math.Ceiling((double)_proofTotalFrames / _proofStates.Length));
        var stateIndex = Math.Min(_proofStates.Length - 1, _proofFrame / segmentFrames);
        if (stateIndex != _proofStateIndex)
        {
            _proofStateIndex = stateIndex;
            var state = _proofStates[stateIndex];
            if (!ShowState(state)) return;
            var reported = _target.Call("forge_visual_current_state").AsString();
            if (reported != state) { Fail($"proof requested state {state} but adapter reported {reported}"); return; }
            GD.Print($"FORGE_VISUAL_PROOF_STATE:{reported}:{_proofFrame}");
        }
        _target.Call("forge_visual_tick_proof", _proofFrame, _proofTotalFrames, _proofFps);
        if (_proofFrame % _proofFps == 0)
        {
            QueueProofSample(_proofFrame);
            if (_proofTerminal) return;
        }
        _proofFrame++;
        if (_proofFrame < _proofTotalFrames) return;
        _proofSimulationComplete = true;
        FinishAfterLastDraw();
    }

    private void QueueProofSample(int frame)
    {
        if (_proofSampleInFlight) { Fail($"proof sample overlap at frame {frame}"); return; }
        _proofSampleInFlight = true;
        CaptureProofSample(frame);
    }

    private async void CaptureProofSample(int frame)
    {
        try
        {
            await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            if (_proofTerminal) return;
            var image = GetViewport().GetTexture().GetImage();
            if (image == null || image.IsEmpty()) { Fail("proof sample viewport returned an empty image"); return; }
            if (image.GetWidth() != _proofWidth || image.GetHeight() != _proofHeight)
            {
                Fail($"proof sample is {image.GetWidth()}x{image.GetHeight()}, expected {_proofWidth}x{_proofHeight}"); return;
            }
            var output = Path.Combine(_proofSamplesDir, $"sample-{frame:D6}.png");
            var saveError = image.SavePng(output);
            if (saveError != Error.Ok) { Fail($"proof sample save_png failed: {saveError}"); return; }
            _proofSamplesWritten++;
            GD.Print($"FORGE_VISUAL_PROOF_SAMPLE:{frame}:{output}");
        }
        catch (Exception error)
        {
            if (!_proofTerminal) Fail($"proof sample failed: {error.Message}");
        }
        finally
        {
            _proofSampleInFlight = false;
            MaybeFinishProof();
        }
    }

    private async void FinishAfterLastDraw()
    {
        try
        {
            await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            if (_proofTerminal) return;
            _proofFinalDrawSeen = true;
            MaybeFinishProof();
        }
        catch (Exception error)
        {
            if (!_proofTerminal) Fail($"proof final draw failed: {error.Message}");
        }
    }

    private void MaybeFinishProof()
    {
        if (_proofTerminal || !_proofSimulationComplete || !_proofFinalDrawSeen || _proofSampleInFlight) return;
        if (_proofSamplesWritten != _proofExpectedSamples)
        {
            Fail($"proof wrote {_proofSamplesWritten}/{_proofExpectedSamples} required samples"); return;
        }
        _proofTerminal = true;
        _proofActive = false;
        GD.Print($"FORGE_VISUAL_PROOF_COMPLETE:{_proofFrame}");
        GetTree().Quit(0);
    }

    private void Fail(string message)
    {
        _proofTerminal = true;
        _proofActive = false;
        GD.PrintErr($"FORGE_VISUAL_ERROR:{message}");
        GetTree().Quit(2);
    }
}
