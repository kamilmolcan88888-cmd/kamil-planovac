class_name WorldBuilder
extends Node3D
## Builds the static world (ground, roads, sidewalks, buildings, props) from a
## map dictionary. The map format is described in docs/MAPA.md; the same
## format is produced by tools/osm_import.py from real OpenStreetMap data.

const KERB_HEIGHT := 0.1
const ROAD_Y := 0.03
const AREA_Y := 0.015
const GROUND_SIZE := 800.0

const BUILDING_COLORS := {
	"apartments": Color(0.78, 0.74, 0.66),
	"house": Color(0.85, 0.8, 0.7),
	"garage": Color(0.55, 0.55, 0.55),
	"school": Color(0.8, 0.7, 0.55),
	"shop": Color(0.7, 0.75, 0.8),
	"church": Color(0.9, 0.88, 0.8),
	"industrial": Color(0.6, 0.62, 0.65),
}
const AREA_COLORS := {
	"parking": Color(0.3, 0.3, 0.32),
	"paved": Color(0.6, 0.6, 0.6),
	"grass": Color(0.3, 0.5, 0.24),
	"playground": Color(0.78, 0.7, 0.5),
	"water": Color(0.2, 0.4, 0.65),
}

var map: Dictionary = {}
var _materials: Dictionary = {}


static func load_map(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_error("Map file is missing or empty: %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Map file is not a JSON object: %s" % path)
		return {}
	return parsed


func build(data: Dictionary) -> void:
	map = data
	_build_ground()
	for area: Variant in _list("areas"):
		_build_area(area)
	for road: Variant in _list("roads"):
		_build_road(road)
	for sidewalk: Variant in _list("sidewalks"):
		_build_sidewalk(sidewalk)
	for building: Variant in _list("buildings"):
		_build_building(building)
	for prop: Variant in _list("props"):
		_build_prop(prop)


# --- map access helpers -------------------------------------------------------

func _list(key: String) -> Array:
	var value: Variant = map.get(key, [])
	if typeof(value) == TYPE_ARRAY:
		return value
	return []


## [east, north] from the map file -> world (x, z).
static func point(value: Variant) -> Vector2:
	if typeof(value) == TYPE_ARRAY and (value as Array).size() >= 2:
		var pair: Array = value
		return Vector2(float(pair[0]), -float(pair[1]))
	return Vector2.ZERO


static func points(value: Variant) -> PackedVector2Array:
	var result := PackedVector2Array()
	if typeof(value) == TYPE_ARRAY:
		for item: Variant in (value as Array):
			result.append(point(item))
	return result


## [east, north] -> world position on the ground.
static func world_pos(value: Variant, y: float = 0.0) -> Vector3:
	var p := point(value)
	return Vector3(p.x, y, p.y)


func _material(color: Color, roughness: float = 0.9) -> StandardMaterial3D:
	var key := "%s/%.2f" % [color.to_html(), roughness]
	if _materials.has(key):
		return _materials[key]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = roughness
	# Generated meshes have no back faces; drawing both sides keeps them
	# visible from every angle.
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_materials[key] = mat
	return mat


func _static_body(node_name: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.collision_layer = Layers.WORLD
	body.collision_mask = 0
	return body


func _add_mesh(mesh: ArrayMesh, material: Material, node_name: String, with_collision: bool) -> Node3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	if not with_collision:
		instance.name = node_name
		add_child(instance)
		return instance
	var body := _static_body(node_name)
	body.add_child(instance)
	var shape := mesh.create_trimesh_shape()
	shape.backface_collision = true
	var collider := CollisionShape3D.new()
	collider.shape = shape
	body.add_child(collider)
	add_child(body)
	return body


# --- ground, roads, areas -----------------------------------------------------

func _build_ground() -> void:
	var body := _static_body("Ground")
	var shape := BoxShape3D.new()
	shape.size = Vector3(GROUND_SIZE, 1.0, GROUND_SIZE)
	var collider := CollisionShape3D.new()
	collider.shape = shape
	collider.position.y = -0.5
	body.add_child(collider)
	var plane := PlaneMesh.new()
	plane.size = Vector2(GROUND_SIZE, GROUND_SIZE)
	var instance := MeshInstance3D.new()
	instance.mesh = plane
	instance.material_override = _material(Color(0.33, 0.47, 0.26), 1.0)
	body.add_child(instance)
	add_child(body)


func _build_area(area: Variant) -> void:
	if typeof(area) != TYPE_DICTIONARY:
		return
	var data: Dictionary = area
	var kind := str(data.get("kind", "paved"))
	var mesh := MeshUtil.prism(points(data.get("polygon", [])), AREA_Y, AREA_Y)
	if mesh == null:
		return
	var color: Color = AREA_COLORS.get(kind, Color(0.5, 0.5, 0.5))
	_add_mesh(mesh, _material(color), "Area_%s" % kind, false)


func _build_road(road: Variant) -> void:
	if typeof(road) != TYPE_DICTIONARY:
		return
	var data: Dictionary = road
	var width := float(data.get("width", 6.0))
	var mesh := MeshUtil.ribbon(points(data.get("points", [])), width, ROAD_Y, ROAD_Y)
	if mesh == null:
		return
	# The flat ground collider carries the traffic; the road is visual only.
	_add_mesh(mesh, _material(Color(0.2, 0.2, 0.22), 0.95), "Road_%s" % str(data.get("name", "")), false)


func _build_sidewalk(sidewalk: Variant) -> void:
	if typeof(sidewalk) != TYPE_DICTIONARY:
		return
	var data: Dictionary = sidewalk
	var width := float(data.get("width", 2.0))
	var mesh := MeshUtil.ribbon(points(data.get("points", [])), width, 0.0, KERB_HEIGHT)
	if mesh == null:
		return
	_add_mesh(mesh, _material(Color(0.62, 0.61, 0.58)), "Sidewalk", true)


# --- buildings ----------------------------------------------------------------

func _build_building(building: Variant) -> void:
	if typeof(building) != TYPE_DICTIONARY:
		return
	var data: Dictionary = building
	var footprint := MeshUtil.clean_polygon(points(data.get("footprint", [])))
	if footprint.size() < 3:
		return
	var kind := str(data.get("kind", "house"))
	var height := float(data.get("height", 6.0))
	var mesh := MeshUtil.prism(footprint, 0.0, height)
	if mesh == null:
		return
	var color: Color = BUILDING_COLORS.get(kind, Color(0.75, 0.72, 0.68))
	var address := str(data.get("address", ""))
	var is_focus := address != "" and address == str(map.get("focus_address", ""))
	if is_focus:
		color = Color(0.86, 0.62, 0.36)
	var label_text := address if address != "" else str(data.get("name", ""))
	var body := _add_mesh(mesh, _material(color), "Building_%s" % label_text, true)
	if label_text != "":
		var label := Label3D.new()
		label.text = label_text
		label.font_size = 96
		label.pixel_size = 0.012
		label.outline_size = 16
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		var center := MeshUtil.centroid(footprint)
		label.position = Vector3(center.x, height + 1.5, center.y)
		body.add_child(label)


# --- props --------------------------------------------------------------------

func _build_prop(prop: Variant) -> void:
	if typeof(prop) != TYPE_DICTIONARY:
		return
	var data: Dictionary = prop
	var pos := world_pos(data.get("pos", [0, 0]))
	var heading := float(data.get("heading", 0.0))
	match str(data.get("kind", "")):
		"tree":
			_add_tree(pos)
		"lamp":
			_add_lamp(pos)
		"bench":
			_add_box_prop("Bench", pos, heading, Vector3(1.6, 0.45, 0.5), Color(0.45, 0.3, 0.18))
		"ramp":
			_add_ramp(pos, heading, float(data.get("angle", 12.0)))
		"stairs":
			_add_stairs(pos, heading, int(data.get("steps", 6)))
		"crate":
			_add_rigid_box(pos, Vector3(0.6, 0.6, 0.6), 15.0, Color(0.6, 0.45, 0.25))
		"bin":
			_add_rigid_cylinder(pos, 0.25, 0.8, 10.0, Color(0.2, 0.35, 0.25))
		"ball":
			_add_ball(pos)
		_:
			pass


func _mesh_instance(mesh: Mesh, color: Color, offset: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = _material(color)
	instance.position = offset
	return instance


func _collider(shape: Shape3D, offset: Vector3 = Vector3.ZERO) -> CollisionShape3D:
	var collider := CollisionShape3D.new()
	collider.shape = shape
	collider.position = offset
	return collider


func _add_tree(pos: Vector3) -> void:
	var body := _static_body("Tree")
	body.position = pos
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.16
	trunk.bottom_radius = 0.22
	trunk.height = 3.2
	body.add_child(_mesh_instance(trunk, Color(0.35, 0.24, 0.15), Vector3(0, 1.6, 0)))
	var crown := SphereMesh.new()
	crown.radius = 1.9
	crown.height = 3.8
	body.add_child(_mesh_instance(crown, Color(0.2, 0.42, 0.18), Vector3(0, 4.4, 0)))
	var shape := CylinderShape3D.new()
	shape.radius = 0.22
	shape.height = 3.2
	body.add_child(_collider(shape, Vector3(0, 1.6, 0)))
	add_child(body)


func _add_lamp(pos: Vector3) -> void:
	var body := _static_body("Lamp")
	body.position = pos
	var pole := CylinderMesh.new()
	pole.top_radius = 0.06
	pole.bottom_radius = 0.09
	pole.height = 6.0
	body.add_child(_mesh_instance(pole, Color(0.35, 0.36, 0.38), Vector3(0, 3.0, 0)))
	var head := BoxMesh.new()
	head.size = Vector3(0.25, 0.12, 0.6)
	body.add_child(_mesh_instance(head, Color(0.9, 0.9, 0.8), Vector3(0, 6.0, 0)))
	var shape := CylinderShape3D.new()
	shape.radius = 0.09
	shape.height = 6.0
	body.add_child(_collider(shape, Vector3(0, 3.0, 0)))
	add_child(body)


func _add_box_prop(node_name: String, pos: Vector3, heading: float, size: Vector3, color: Color) -> void:
	var body := _static_body(node_name)
	body.position = pos
	body.rotation.y = Geo.heading_to_yaw(heading)
	var mesh := BoxMesh.new()
	mesh.size = size
	body.add_child(_mesh_instance(mesh, color, Vector3(0, size.y * 0.5, 0)))
	var shape := BoxShape3D.new()
	shape.size = size
	body.add_child(_collider(shape, Vector3(0, size.y * 0.5, 0)))
	add_child(body)


## Test ramp: drive up it in the direction of `heading`.
func _add_ramp(pos: Vector3, heading: float, angle_deg: float) -> void:
	var length := 7.0
	var size := Vector3(3.2, 0.2, length)
	var body := _static_body("Ramp")
	body.position = pos
	body.rotation.y = Geo.heading_to_yaw(heading)
	var angle := deg_to_rad(angle_deg)
	# The deck starts at ground level at the near end and rises towards -Z.
	var deck_offset := Vector3(0, sin(angle) * length * 0.5 - 0.1, -cos(angle) * length * 0.5)
	var mesh := BoxMesh.new()
	mesh.size = size
	var instance := _mesh_instance(mesh, Color(0.75, 0.55, 0.2), deck_offset)
	instance.rotation.x = angle
	body.add_child(instance)
	var shape := BoxShape3D.new()
	shape.size = size
	var collider := _collider(shape, deck_offset)
	collider.rotation.x = angle
	body.add_child(collider)
	add_child(body)


## Test stairs with 0.18 m risers, rising in the direction of `heading`.
func _add_stairs(pos: Vector3, heading: float, steps: int) -> void:
	var rise := 0.18
	var run := 0.32
	var width := 2.0
	var body := _static_body("Stairs")
	body.position = pos
	body.rotation.y = Geo.heading_to_yaw(heading)
	for i in steps:
		var step_height := rise * float(i + 1)
		var size := Vector3(width, step_height, run)
		var offset := Vector3(0, step_height * 0.5, -run * (float(i) + 0.5))
		var mesh := BoxMesh.new()
		mesh.size = size
		body.add_child(_mesh_instance(mesh, Color(0.66, 0.66, 0.66), offset))
		var shape := BoxShape3D.new()
		shape.size = size
		body.add_child(_collider(shape, offset))
	# Landing on top.
	var top_height := rise * float(steps)
	var landing := Vector3(width, top_height, 2.0)
	var landing_offset := Vector3(0, top_height * 0.5, -run * float(steps) - 1.0)
	var landing_mesh := BoxMesh.new()
	landing_mesh.size = landing
	body.add_child(_mesh_instance(landing_mesh, Color(0.6, 0.6, 0.6), landing_offset))
	var landing_shape := BoxShape3D.new()
	landing_shape.size = landing
	body.add_child(_collider(landing_shape, landing_offset))
	add_child(body)


func _rigid_body(node_name: String, pos: Vector3, mass: float) -> RigidBody3D:
	var body := RigidBody3D.new()
	body.name = node_name
	body.mass = mass
	body.position = pos
	body.collision_layer = Layers.PROP
	body.collision_mask = Layers.WORLD | Layers.VEHICLE | Layers.CHARACTER | Layers.PROP
	return body


func _add_rigid_box(pos: Vector3, size: Vector3, mass: float, color: Color) -> void:
	var body := _rigid_body("Crate", pos + Vector3(0, size.y * 0.5 + 0.05, 0), mass)
	var mesh := BoxMesh.new()
	mesh.size = size
	body.add_child(_mesh_instance(mesh, color))
	var shape := BoxShape3D.new()
	shape.size = size
	body.add_child(_collider(shape))
	add_child(body)


func _add_rigid_cylinder(pos: Vector3, radius: float, height: float, mass: float, color: Color) -> void:
	var body := _rigid_body("Bin", pos + Vector3(0, height * 0.5 + 0.05, 0), mass)
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	body.add_child(_mesh_instance(mesh, color))
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	body.add_child(_collider(shape))
	add_child(body)


func _add_ball(pos: Vector3) -> void:
	var radius := 0.22
	var body := _rigid_body("Ball", pos + Vector3(0, radius + 0.05, 0), 0.45)
	var bouncy := PhysicsMaterial.new()
	bouncy.bounce = 0.6
	bouncy.friction = 0.6
	body.physics_material_override = bouncy
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	body.add_child(_mesh_instance(mesh, Color(0.9, 0.9, 0.9)))
	var shape := SphereShape3D.new()
	shape.radius = radius
	body.add_child(_collider(shape))
	add_child(body)
