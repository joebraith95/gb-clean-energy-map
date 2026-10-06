import numpy as np

from pipeline import build_grid
from pipeline.build_grid import GB_LAND, OTHER_LAND, SEA


def square(x0, y0, size):
    return np.array([[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]], dtype=float)


def test_rasterise_fills_inside_and_respects_holes(monkeypatch):
    monkeypatch.setattr(build_grid, "EXTENT", {"min_x": 0, "min_y": 0, "max_x": 10, "max_y": 10})
    mask = build_grid._rasterise([square(0, 0, 10), square(4, 4, 2)], 1)
    assert mask.sum() == 100 - 4
    assert not mask[4:6, 4:6].any()


def test_rasterise_row_zero_is_north(monkeypatch):
    monkeypatch.setattr(build_grid, "EXTENT", {"min_x": 0, "min_y": 0, "max_x": 4, "max_y": 4})
    mask = build_grid._rasterise([square(0, 3, 1)], 1)
    assert mask[0, 0] and mask.sum() == 1


def test_downsample_pads_and_uses_land_share():
    fine = np.full((5, 4), SEA, dtype=np.uint8)
    fine[0:2, 0:1] = GB_LAND  # half of the first 2x2 block
    fine[0:2, 2:4] = OTHER_LAND  # all of the second block
    grid = build_grid._downsample(fine, 2)
    assert grid.shape == (3, 2)
    assert grid[0, 0] == GB_LAND
    assert grid[0, 1] == OTHER_LAND
    assert (grid[1:] == SEA).all()


def test_run_length_round_trip():
    grid = np.array([[0, 0, 1], [1, 2, 2]], dtype=np.uint8)
    runs = build_grid._run_length(grid)
    assert runs == [0, 2, 1, 2, 2, 2]
    values, counts = np.array(runs[0::2]), np.array(runs[1::2])
    assert (np.repeat(values, counts).reshape(grid.shape) == grid).all()


def test_drop_tiny_removes_small_rings_and_holes():
    big = square(0, 0, 1000).tolist()
    small = square(0, 0, 50).tolist()
    kept = build_grid._drop_tiny([[big, small], [small]])
    assert len(kept) == 1 and len(kept[0]) == 1
