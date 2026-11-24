class_name Hud
extends CanvasLayer
## Heads-up display built in code: health, stamina, speedometer, context hint,
## controls help (F1) and a debug read-out with GPS position (F3).

const HELP_TEXT := """OVLÁDANIE
W A S D / šípky – pohyb          myš – kamera
Shift – šprint      Ctrl – chôdza      Medzerník – skok
Ľavé tlačidlo – úder (3. v sérii je silný)      Pravé tlačidlo – kryt
F / E – nastúpiť / vystúpiť z auta
V aute: W plyn, S brzda / spiatočka, A D volant, Medzerník ručná brzda
R – návrat na štart / postaviť auto na kolesá
F5 – reštart scény      Esc – uvoľniť myš
F1 – skryť / zobraziť túto nápovedu      F3 – ladiace údaje"""

var player: Player
var map: Dictionary = {}

var _health_bar: ProgressBar
var _stamina_bar: ProgressBar
var _speed_label: Label
var _hint_label: Label
var _help_label: Label
var _debug_label: Label


func _ready() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var bars := VBoxContainer.new()
	bars.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bars.grow_vertical = Control.GROW_DIRECTION_BEGIN
	root.add_child(bars)
	bars.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_MINSIZE, 24)
	_health_bar = _bar(bars, "Zdravie", Color(0.8, 0.15, 0.15))
	_stamina_bar = _bar(bars, "Výdrž", Color(0.2, 0.6, 0.85))

	_speed_label = _label(root, 34)
	_speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_speed_label.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_speed_label.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_speed_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_MINSIZE, 24)

	_hint_label = _label(root, 22)
	_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_hint_label.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_hint_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM, Control.PRESET_MODE_MINSIZE, 90)

	_help_label = _label(root, 16)
	_help_label.text = HELP_TEXT
	_help_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT, Control.PRESET_MODE_MINSIZE, 16)

	_debug_label = _label(root, 15)
	_debug_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_debug_label.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_debug_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT, Control.PRESET_MODE_MINSIZE, 16)
	_debug_label.visible = false


func _label(parent: Control, font_size: int) -> Label:
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_outline_color", Color.BLACK)
	label.add_theme_constant_override("outline_size", 6)
	parent.add_child(label)
	return label


func _bar(parent: Control, title: String, color: Color) -> ProgressBar:
	var caption := Label.new()
	caption.text = title
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	caption.add_theme_color_override("font_outline_color", Color.BLACK)
	caption.add_theme_constant_override("outline_size", 5)
	parent.add_child(caption)
	var bar := ProgressBar.new()
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.custom_minimum_size = Vector2(260, 16)
	bar.show_percentage = false
	bar.min_value = 0.0
	bar.max_value = 100.0
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	bar.add_theme_stylebox_override("fill", fill)
	var background := StyleBoxFlat.new()
	background.bg_color = Color(0, 0, 0, 0.55)
	bar.add_theme_stylebox_override("background", background)
	parent.add_child(bar)
	return bar


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_help"):
		_help_label.visible = not _help_label.visible
	elif event.is_action_pressed("toggle_debug"):
		_debug_label.visible = not _debug_label.visible


func _process(_delta: float) -> void:
	if player == null or not is_instance_valid(player):
		return
	_health_bar.max_value = player.max_health
	_health_bar.value = player.health
	_stamina_bar.max_value = player.max_stamina
	_stamina_bar.value = player.stamina

	var car := player.vehicle
	if car != null:
		_speed_label.text = "%d km/h\nauto %d %%" % [roundi(car.speed_kmh()), roundi(car.health / car.max_health * 100.0)]
	else:
		_speed_label.text = ""

	_hint_label.text = _hint()
	if _debug_label.visible:
		_debug_label.text = _debug_text()


func _hint() -> String:
	match player.state:
		Character.State.DEAD:
			return "Si mŕtvy – stlač R"
		Character.State.KNOCKED_DOWN:
			return "Zrazili ťa…"
		Character.State.IN_VEHICLE:
			if player.vehicle != null and player.vehicle.health <= 0.0:
				return "Auto je zničené – F vystúpiť"
			return ""
		_:
			if player.nearby_car != null:
				return "F – nastúpiť"
			return ""


func _debug_text() -> String:
	var pos := player.global_position
	var en := Geo.world_to_en(pos)
	var lines := PackedStringArray()
	lines.append("%d FPS" % Engine.get_frames_per_second())
	lines.append("stav: %s" % Character.State.keys()[player.state])
	lines.append("rýchlosť: %.1f m/s" % player.velocity.length())
	lines.append("východ %.1f m, sever %.1f m, výška %.2f m" % [en.x, en.y, pos.y])
	var origin: Variant = map.get("origin", null)
	if typeof(origin) == TYPE_DICTIONARY:
		var origin_dict: Dictionary = origin
		var latlon := Geo.en_to_latlon(en.x, en.y, float(origin_dict.get("lat", 0.0)), float(origin_dict.get("lon", 0.0)))
		lines.append("GPS %.6f, %.6f" % [latlon.x, latlon.y])
		if bool(map.get("placeholder", false)):
			lines.append("(mapa je schéma – GPS je len orientačné)")
	return "\n".join(lines)
