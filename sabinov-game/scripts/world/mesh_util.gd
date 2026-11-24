class_name MeshUtil
extends RefCounted
## Procedural mesh helpers. All 2D input is in world (x, z) coordinates.


static func v3(p: Vector2, y: float) -> Vector3:
	return Vector3(p.x, y, p.y)


## Adds a triangle that is visible from the side `normal` points to.
## Godot treats clockwise triangles as front faces, so the right-hand normal
## of (a, b, c) must point away from the wanted normal.
static func add_tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, normal: Vector3) -> void:
	if (b - a).cross(c - a).dot(normal) > 0.0:
		var swap := b
		b = c
		c = swap
	st.set_normal(normal)
	st.add_vertex(a)
	st.set_normal(normal)
	st.add_vertex(b)
	st.set_normal(normal)
	st.add_vertex(c)


static func add_quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, normal: Vector3) -> void:
	add_tri(st, a, b, c, normal)
	add_tri(st, a, c, d, normal)


static func _add_wall(st: SurfaceTool, p: Vector2, q: Vector2, y_bottom: float, y_top: float, outward: Vector2) -> void:
	if p.distance_squared_to(q) < 0.000001:
		return
	add_quad(st, v3(p, y_bottom), v3(q, y_bottom), v3(q, y_top), v3(p, y_top), Vector3(outward.x, 0.0, outward.y))


## A strip of constant width along a polyline (roads, sidewalks, paths).
## With y_top > y_bottom the strip gets side walls (a raised kerb).
static func ribbon(points: PackedVector2Array, width: float, y_bottom: float, y_top: float) -> ArrayMesh:
	var count := points.size()
	if count < 2:
		return null
	var half := width * 0.5
	var left := PackedVector2Array()
	var right := PackedVector2Array()
	for i in count:
		var dir := Vector2.ZERO
		if i > 0:
			dir += (points[i] - points[i - 1]).normalized()
		if i < count - 1:
			dir += (points[i + 1] - points[i]).normalized()
		if dir.length_squared() < 0.000001:
			# Hairpin: fall back to the direction of the incoming segment.
			dir = (points[i] - points[maxi(i - 1, 0)])
			if dir.length_squared() < 0.000001:
				dir = Vector2.RIGHT
		dir = dir.normalized()
		var normal := Vector2(-dir.y, dir.x)
		var miter := 1.0
		if i > 0 and i < count - 1:
			var seg := (points[i] - points[i - 1]).normalized()
			var cos_half := absf(normal.dot(Vector2(-seg.y, seg.x)))
			miter = 1.0 / maxf(cos_half, 0.5)
		left.append(points[i] + normal * half * miter)
		right.append(points[i] - normal * half * miter)

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var raised := y_top > y_bottom
	for i in count - 1:
		add_quad(st, v3(left[i], y_top), v3(left[i + 1], y_top), v3(right[i + 1], y_top), v3(right[i], y_top), Vector3.UP)
		if raised:
			var seg_dir := (points[i + 1] - points[i]).normalized()
			var seg_normal := Vector2(-seg_dir.y, seg_dir.x)
			_add_wall(st, left[i], left[i + 1], y_bottom, y_top, seg_normal)
			_add_wall(st, right[i], right[i + 1], y_bottom, y_top, -seg_normal)
	if raised:
		var start_dir := (points[1] - points[0]).normalized()
		var end_dir := (points[count - 1] - points[count - 2]).normalized()
		_add_wall(st, left[0], right[0], y_bottom, y_top, -start_dir)
		_add_wall(st, left[count - 1], right[count - 1], y_bottom, y_top, end_dir)
	return st.commit()


## A polygon extruded from y_bottom to y_top (buildings). With
## y_top == y_bottom only the flat top is produced (parking lots, lawns).
static func prism(polygon: PackedVector2Array, y_bottom: float, y_top: float) -> ArrayMesh:
	polygon = clean_polygon(polygon)
	if polygon.size() < 3:
		return null
	var indices := Geometry2D.triangulate_polygon(polygon)
	if indices.is_empty():
		# Self-intersecting or degenerate outline: use its convex hull instead.
		polygon = clean_polygon(Geometry2D.convex_hull(polygon))
		if polygon.size() < 3:
			return null
		indices = Geometry2D.triangulate_polygon(polygon)
		if indices.is_empty():
			return null

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(0, indices.size(), 3):
		add_tri(st, v3(polygon[indices[i]], y_top), v3(polygon[indices[i + 1]], y_top), v3(polygon[indices[i + 2]], y_top), Vector3.UP)

	if y_top > y_bottom:
		# Positive signed area: the outward side of edge p->q is (edge.y, -edge.x).
		var orientation := 1.0 if signed_area(polygon) > 0.0 else -1.0
		var size := polygon.size()
		for i in size:
			var p := polygon[i]
			var q := polygon[(i + 1) % size]
			var edge := q - p
			if edge.length_squared() < 0.000001:
				continue
			var outward := Vector2(edge.y, -edge.x).normalized() * orientation
			_add_wall(st, p, q, y_bottom, y_top, outward)
	return st.commit()


## Drops a repeated closing point and consecutive duplicates.
static func clean_polygon(polygon: PackedVector2Array) -> PackedVector2Array:
	var result := PackedVector2Array()
	for p in polygon:
		if result.is_empty() or result[result.size() - 1].distance_squared_to(p) > 0.0001:
			result.append(p)
	if result.size() > 1 and result[0].distance_squared_to(result[result.size() - 1]) <= 0.0001:
		result.remove_at(result.size() - 1)
	return result


static func signed_area(polygon: PackedVector2Array) -> float:
	var area := 0.0
	var size := polygon.size()
	for i in size:
		var p := polygon[i]
		var q := polygon[(i + 1) % size]
		area += p.x * q.y - q.x * p.y
	return area * 0.5


static func centroid(polygon: PackedVector2Array) -> Vector2:
	var sum := Vector2.ZERO
	for p in polygon:
		sum += p
	return sum / maxf(float(polygon.size()), 1.0)
