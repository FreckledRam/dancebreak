"""The exported TSVs must reproduce the org's originals exactly, plus the appended columns."""
import pytest

from pipeline import store

LEGACY = store.DATA / "legacy"
N_EXTRA = len(store.EXTRA_COLS)


@pytest.mark.parametrize("system", store.LEGACY_SYSTEMS)
def test_export_matches_legacy(system):
    legacy = (LEGACY / f"{system}DataRaw.tsv").read_text(encoding="utf-8").split("\n")
    ours = (store.EXPORT / f"{system}DataRaw.tsv").read_text(encoding="utf-8").split("\n")
    assert legacy[-1] == "" and ours[-1] == ""
    legacy, ours = legacy[:-1], ours[:-1]
    assert len(ours) >= len(legacy)
    for i, line in enumerate(legacy):
        assert ours[i].split("\t")[:-N_EXTRA] == line.split("\t"), f"{system} row {i}"
