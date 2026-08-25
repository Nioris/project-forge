extends Node
## Project Forge native playtest adapter. It is inert unless --forge-playtest-mode is supplied.

const PROTOCOL := "forge-godot-playtest-v1"
const REQUIRED := ["forge_playtest_state", "forge_playtest_reset", "forge_playtest_save", "forge_playtest_load"]
var options: Dictionary = {}
var target: Node

func _ready() -> void:
	options = _options(OS.get_cmdline_user_args())
	if not options.has("forge-playtest-mode"):
		set_process(false)
		return
	call_deferred("_run")

func _options(args: PackedStringArray) -> Dictionary:
	var out := {}
	for arg in args:
		if arg.begins_with("--forge-playtest-"):
			var cut := arg.find("=")
			if cut > 2:
				out[arg.substr(2, cut - 2)] = arg.substr(cut + 1)
	return out

func _scenario() -> Dictionary:
	var contract_path := String(options.get("forge-playtest-contract", ""))
	if contract_path.is_empty() or not FileAccess.file_exists(contract_path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(contract_path))
	if parsed is Dictionary and parsed.has("scenario") and parsed.scenario is Dictionary:
		return parsed.scenario
	return {}

func _matches(actual: Variant, expected: Variant) -> bool:
	if expected is Dictionary:
		if not actual is Dictionary:
			return false
		for key in expected:
			if not actual.has(key) or not _matches(actual[key], expected[key]):
				return false
		return true
	if expected is Array:
		if not actual is Array or actual.size() != expected.size():
			return false
		for index in expected.size():
			if not _matches(actual[index], expected[index]):
				return false
		return true
	return actual == expected

func _run() -> void:
	await get_tree().process_frame
	target = get_tree().current_scene
	var node_path := String(options.get("forge-playtest-target", "."))
	if node_path != "." and target != null:
		target = target.get_node_or_null(NodePath(node_path))
	if target == null:
		return _fail("target unavailable")
	for method in REQUIRED:
		if not target.has_method(method):
			return _fail("required production method missing: %s" % method)
	var scenario := _scenario()
	if scenario.is_empty():
		return _fail("scenario contract unavailable")
	var mode := String(options.get("forge-playtest-mode", ""))
	if mode == "tech":
		for step in scenario.steps:
			if not InputMap.has_action(String(step.action)):
				return _fail("InputMap action unavailable: %s" % step.action)
		_emit({"protocol": PROTOCOL, "mode": mode, "testHarness": false, "actions": true, "methods": true, "userDataWritten": _write_probe(), "renderer": _renderer_facts()})
		return
	if mode == "save":
		await _run_save(scenario)
	elif mode == "reload":
		_run_reload(scenario)
	else:
		_fail("unsupported mode")

func _run_save(scenario: Dictionary) -> void:
	var initial: Variant = target.call("forge_playtest_state")
	if not _matches(initial, scenario.initialExpect):
		return _fail("initial state does not match contract")
	var observations: Array = []
	for step in scenario.steps:
		var action := String(step.action)
		Input.action_press(action)
		await get_tree().process_frame
		Input.action_release(action)
		await get_tree().process_frame
		var state: Variant = target.call("forge_playtest_state")
		if not _matches(state, step.expect):
			return _fail("state after action %s does not match contract" % action)
		observations.append({"action": action, "state": state})
	var progress: Variant = target.call("forge_playtest_state")
	if not _matches(progress, scenario.progress):
		return _fail("progress state does not match contract")
	var saved := bool(target.call("forge_playtest_save"))
	if not saved:
		return _fail("production save method returned false")
	_emit({"protocol": PROTOCOL, "mode": "save", "testHarness": false, "initial": initial, "steps": observations, "progress": progress, "saved": true, "renderer": _renderer_facts()})

func _run_reload(scenario: Dictionary) -> void:
	target.call("forge_playtest_reset")
	var loaded := bool(target.call("forge_playtest_load"))
	if not loaded:
		return _fail("production load method returned false")
	var state: Variant = target.call("forge_playtest_state")
	if not _matches(state, scenario.saveReload):
		return _fail("reloaded state does not match contract")
	_emit({"protocol": PROTOCOL, "mode": "reload", "testHarness": false, "loaded": true, "state": state, "renderer": _renderer_facts()})

func _renderer_facts() -> Dictionary:
	var viewport_size := Vector2i.ZERO
	var viewport := get_viewport()
	if viewport != null:
		viewport_size = Vector2i(viewport.get_visible_rect().size)
	var window_size := DisplayServer.window_get_size()
	return {
		"headless": OS.has_feature("headless"),
		"displayServer": DisplayServer.get_name(),
		"viewport": {"width": viewport_size.x, "height": viewport_size.y},
		"window": {"width": window_size.x, "height": window_size.y},
	}

func _write_probe() -> bool:
	var file := FileAccess.open("user://forge-playtest-tech-probe.json", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string("{\"protocol\":\"forge-godot-playtest-v1\"}")
	file.close()
	return true

func _emit(value: Dictionary) -> void:
	var output := String(options.get("forge-playtest-report", ""))
	if output.is_empty():
		return _fail("report path missing")
	var file := FileAccess.open(output, FileAccess.WRITE)
	if file == null:
		return _fail("cannot write report")
	file.store_string(JSON.stringify(value))
	file.close()
	print("FORGE_PLAYTEST_PROTOCOL:%s" % PROTOCOL)
	get_tree().quit()

func _fail(message: String) -> void:
	push_error("FORGE_PLAYTEST_ERROR: %s" % message)
	get_tree().quit(2)
