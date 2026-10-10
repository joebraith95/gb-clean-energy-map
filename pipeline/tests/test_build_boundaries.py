import pytest

from pipeline import build_boundaries


def square(x: int, y: int, size: int) -> list:
    return [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]


def test_shared_borders_keeps_only_edges_between_two_areas():
    # Two squares side by side share the edge x = 10; their outer edges are coast.
    lines = build_boundaries.shared_borders([[[square(0, 0, 10)]], [[square(10, 0, 10)]]])
    assert lines == [[(10, 0), (10, 10)]]


def test_shared_borders_ignores_edges_repeated_within_one_area():
    assert build_boundaries.shared_borders([[[square(0, 0, 10)], [square(0, 0, 10)]]]) == []


def test_join_edges_chains_until_a_junction():
    # A "T": three lines meet at (2, 0).
    edges = [((0, 0), (1, 0)), ((1, 0), (2, 0)), ((2, 0), (3, 0)), ((2, 0), (2, 1)), ((2, 1), (2, 2))]
    lines = build_boundaries.join_edges(edges)
    assert sorted(len(line) for line in lines) == [2, 3, 3]
    assert sum(len(line) - 1 for line in lines) == len(edges)


def test_join_edges_keeps_closed_loops():
    # An area wholly inside another: its border has no junction.
    ring = [(0, 0), (1, 0), (1, 1), (0, 1)]
    edges = [(min(a, b), max(a, b)) for a, b in zip(ring, ring[1:] + ring[:1])]
    lines = build_boundaries.join_edges(edges)
    assert len(lines) == 1
    assert lines[0][0] == lines[0][-1]
    assert len(lines[0]) == 5


def test_simplify_drops_points_close_to_the_line():
    line = [(0, 0), (500, 10), (1000, 0), (1500, 400), (2000, 0)]
    assert build_boundaries.simplify(line, 150) == [(0, 0), (1000, 0), (1500, 400), (2000, 0)]


def test_label_point_is_the_centroid_of_the_largest_polygon():
    polygons = [[square(100, 100, 2)], [square(0, 0, 10)]]
    assert build_boundaries.label_point(polygons) == pytest.approx((5, 5))
