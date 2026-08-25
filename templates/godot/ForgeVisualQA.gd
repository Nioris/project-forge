extends Node
## Project Forge native visual adapter. Inert unless --forge-visual-mode is present.

const PROTOCOL := "forge-godot-visual-v1"
const REQUIRED_METHODS := [
	"forge_visual_states",
	"forge_visual_show_state",
	"forge_visual_current_state",
	"forge_visual_tick_proof",
]

var _options: Dictionary = {}
var _target: Node = null
var _proof_active := false
var _proof_frame := 0
var _proof_total_frames := 0
var _proof_fps := 30
var _proof_states: PackedStringArray = []
var _proof_state_index := -1
var _proof_samples_dir := ""
var _proof_expected_samples := 0
var _proof_samples_written := 0
var _proof_sample_in_flight := false
var _proof_simulation_complete := false
var _proof_final_draw_seen := false
var _proof_terminal := false
var _proof_width := 0
var _proof_height := 0


func _ready() -> void:
	_options = _parse_options(OS.get_cmdline_user_args())
	if not _options.has("forge-visual-mode"):
		set_process(false)
		return
	call_deferred("_start_visual_run")


func _parse_options(arguments: PackedStringArray) -> Dictionary:
	var values := {}
	for argument in arguments:
		if not argument.begins_with("--forge-"):
			continue
		var separator := argument.find("=")
		if separator <= 2:
			continue
		values[argument.substr(2, separator - 2)] = argument.substr(separator + 1)
	return values


func _start_visual_run() -> void:
	await get_tree().process_frame
	_target = get_tree().current_scene
	var target_path := String(_options.get("forge-visual-target", "."))
	if target_path != "." and _target != null:
		_target = _target.get_node_or_null(NodePath(target_path))
	if _target == null:
		_fail("target node is unavailable: %s" % target_path)
		return
	for method in REQUIRED_METHODS:
		if not _target.has_method(method):
			_fail("target node lacks required method: %s" % method)
			return
	print("FORGE_VISUAL_PROTOCOL:%s" % PROTOCOL)
	var mode := String(_options.get("forge-visual-mode", ""))
	if mode == "capture":
		await _capture_state()
	elif mode == "proof":
		_start_proof()
	else:
		_fail("unsupported mode: %s" % mode)


func _declared_states() -> PackedStringArray:
	var result: PackedStringArray = []
	for value in Array(_target.call("forge_visual_states")):
		result.append(String(value))
	return result


func _show_state(state: String) -> bool:
	if state not in _declared_states():
		_fail("adapter did not declare state: %s" % state)
		return false
	_target.call("forge_visual_show_state", state)
	return true


func _capture_state() -> void:
	var state := String(_options.get("forge-visual-state", ""))
	var output := String(_options.get("forge-visual-output", ""))
	var settle_frames := clampi(int(_options.get("forge-visual-settle-frames", "6")), 2, 120)
	if state.is_empty() or output.is_empty() or not _show_state(state):
		if state.is_empty() or output.is_empty():
			_fail("capture state/output is missing")
		return
	for _frame in range(settle_frames):
		await get_tree().process_frame
	var reported := String(_target.call("forge_visual_current_state"))
	if reported != state:
		_fail("requested state %s but adapter reported %s" % [state, reported])
		return
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	if image == null or image.is_empty():
		_fail("viewport returned an empty image")
		return
	var expected_width := int(_options.get("forge-visual-width", "0"))
	var expected_height := int(_options.get("forge-visual-height", "0"))
	if image.get_width() != expected_width or image.get_height() != expected_height:
		_fail("viewport image is %dx%d, expected %dx%d" % [image.get_width(), image.get_height(), expected_width, expected_height])
		return
	var directory_error := DirAccess.make_dir_recursive_absolute(output.get_base_dir())
	if directory_error != OK and directory_error != ERR_ALREADY_EXISTS:
		_fail("cannot create capture directory: %s" % directory_error)
		return
	var save_error := image.save_png(output)
	if save_error != OK:
		_fail("save_png failed: %s" % save_error)
		return
	print("FORGE_VISUAL_STATE:%s" % reported)
	print("FORGE_VISUAL_CAPTURED:%s" % output)
	get_tree().quit(0)


func _start_proof() -> void:
	_proof_states = PackedStringArray(String(_options.get("forge-proof-states", "")).split(",", false))
	_proof_total_frames = int(_options.get("forge-proof-total-frames", "0"))
	_proof_fps = int(_options.get("forge-proof-fps", "30"))
	_proof_samples_dir = String(_options.get("forge-proof-samples-dir", ""))
	_proof_width = int(_options.get("forge-visual-width", "0"))
	_proof_height = int(_options.get("forge-visual-height", "0"))
	if _proof_fps <= 0 or _proof_total_frames % _proof_fps != 0:
		_fail("proof total frames must contain a whole number of seconds")
		return
	var duration_seconds := floori(float(_proof_total_frames) / float(_proof_fps))
	if _proof_states.size() < 2 or duration_seconds < 15 or duration_seconds > 20:
		_fail("proof plan must contain 2+ states and last 15 to 20 seconds")
		return
	if _proof_samples_dir.is_empty() or not _proof_samples_dir.is_absolute_path() or _proof_width <= 0 or _proof_height <= 0:
		_fail("proof samples directory or viewport dimensions are missing")
		return
	var directory_error := DirAccess.make_dir_recursive_absolute(_proof_samples_dir)
	if directory_error != OK and directory_error != ERR_ALREADY_EXISTS:
		_fail("cannot create proof samples directory: %s" % directory_error)
		return
	for state in _proof_states:
		if state not in _declared_states():
			_fail("adapter did not declare proof state: %s" % state)
			return
	_proof_expected_samples = duration_seconds
	_proof_active = true
	set_process(true)
	print("FORGE_VISUAL_PROOF_READY:%d:%d" % [_proof_total_frames, _proof_fps])


func _process(_delta: float) -> void:
	if not _proof_active or _proof_simulation_complete:
		return
	var segment_frames := maxi(1, ceili(float(_proof_total_frames) / float(_proof_states.size())))
	var state_index := mini(_proof_states.size() - 1, floori(float(_proof_frame) / float(segment_frames)))
	if state_index != _proof_state_index:
		_proof_state_index = state_index
		var state := _proof_states[state_index]
		if not _show_state(state):
			return
		var reported := String(_target.call("forge_visual_current_state"))
		if reported != state:
			_fail("proof requested state %s but adapter reported %s" % [state, reported])
			return
		print("FORGE_VISUAL_PROOF_STATE:%s:%d" % [reported, _proof_frame])
	_target.call("forge_visual_tick_proof", _proof_frame, _proof_total_frames, _proof_fps)
	if _proof_frame % _proof_fps == 0:
		_queue_proof_sample(_proof_frame)
		if _proof_terminal:
			return
	_proof_frame += 1
	if _proof_frame >= _proof_total_frames:
		_proof_simulation_complete = true
		_finish_after_last_draw()


func _queue_proof_sample(frame: int) -> void:
	if _proof_sample_in_flight:
		_fail("proof sample overlap at frame %d" % frame)
		return
	_proof_sample_in_flight = true
	_capture_proof_sample(frame)


func _capture_proof_sample(frame: int) -> void:
	await RenderingServer.frame_post_draw
	if _proof_terminal:
		return
	var image := get_viewport().get_texture().get_image()
	if image == null or image.is_empty():
		_fail("proof sample viewport returned an empty image")
		return
	if image.get_width() != _proof_width or image.get_height() != _proof_height:
		_fail("proof sample is %dx%d, expected %dx%d" % [image.get_width(), image.get_height(), _proof_width, _proof_height])
		return
	var output := _proof_samples_dir.path_join("sample-%06d.png" % frame)
	var save_error := image.save_png(output)
	if save_error != OK:
		_fail("proof sample save_png failed: %s" % save_error)
		return
	_proof_samples_written += 1
	_proof_sample_in_flight = false
	print("FORGE_VISUAL_PROOF_SAMPLE:%d:%s" % [frame, output])
	_maybe_finish_proof()


func _finish_after_last_draw() -> void:
	await RenderingServer.frame_post_draw
	if _proof_terminal:
		return
	_proof_final_draw_seen = true
	_maybe_finish_proof()


func _maybe_finish_proof() -> void:
	if _proof_terminal or not _proof_simulation_complete or not _proof_final_draw_seen or _proof_sample_in_flight:
		return
	if _proof_samples_written != _proof_expected_samples:
		_fail("proof wrote %d/%d required samples" % [_proof_samples_written, _proof_expected_samples])
		return
	_proof_terminal = true
	_proof_active = false
	print("FORGE_VISUAL_PROOF_COMPLETE:%d" % _proof_frame)
	get_tree().quit(0)


func _fail(message: String) -> void:
	_proof_terminal = true
	_proof_active = false
	printerr("FORGE_VISUAL_ERROR:%s" % message)
	get_tree().quit(2)
