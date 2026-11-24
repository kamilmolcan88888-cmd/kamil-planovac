extends Node
## Autoload "Game": input map, mouse capture and global shortcuts.
## Keeping the input map in code means the project works without hand-editing
## project.godot; move the bindings to Project Settings > Input Map later if
## you want players to rebind keys.

var player: Node3D


func _enter_tree() -> void:
	_register_inputs()


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventMouseButton and event.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event.is_action_pressed("restart_scene"):
		get_tree().reload_current_scene()


func _register_inputs() -> void:
	_key("move_forward", KEY_W)
	_key("move_forward", KEY_UP)
	_key("move_back", KEY_S)
	_key("move_back", KEY_DOWN)
	_key("move_left", KEY_A)
	_key("move_left", KEY_LEFT)
	_key("move_right", KEY_D)
	_key("move_right", KEY_RIGHT)
	_key("sprint", KEY_SHIFT)
	_key("walk", KEY_CTRL)
	_key("jump", KEY_SPACE)
	_key("handbrake", KEY_SPACE)
	_key("interact", KEY_F)
	_key("interact", KEY_E)
	_key("reset_position", KEY_R)
	_key("restart_scene", KEY_F5)
	_key("toggle_help", KEY_F1)
	_key("toggle_debug", KEY_F3)
	_mouse("attack", MOUSE_BUTTON_LEFT)
	_mouse("block", MOUSE_BUTTON_RIGHT)


func _ensure_action(action: StringName) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)


func _key(action: StringName, keycode: Key) -> void:
	_ensure_action(action)
	var event := InputEventKey.new()
	event.physical_keycode = keycode
	InputMap.action_add_event(action, event)


func _mouse(action: StringName, button: MouseButton) -> void:
	_ensure_action(action)
	var event := InputEventMouseButton.new()
	event.button_index = button
	InputMap.action_add_event(action, event)
