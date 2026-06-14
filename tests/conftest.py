"""Shared test fixtures and environment stubs."""

import io
import os
import zipfile

import pytest

os.environ.setdefault("DISCORD_CLIENT_ID", "test")
os.environ.setdefault("DISCORD_CLIENT_SECRET", "test")

from backend.parser import Atom, Package, Question, Round, Theme  # noqa: E402

_MINIMAL_XML = """\
<?xml version="1.0" encoding="utf-8"?>
<package name="Test Pack" difficulty="5">
  <info/>
  <rounds>
    <round name="Round 1">
      <themes>
        <theme name="Animals">
          <questions>
            <question price="100">
              <scenario><atom>What sound does a cat make?</atom></scenario>
              <right><answer>meow</answer></right>
            </question>
            <question price="200">
              <scenario><atom>What sound does a dog make?</atom></scenario>
              <right><answer>woof</answer></right>
            </question>
          </questions>
        </theme>
      </themes>
    </round>
  </rounds>
</package>"""


@pytest.fixture
def minimal_siq(tmp_path):
    """A minimal .siq archive on disk with two questions in one theme."""
    siq_path = tmp_path / "test.siq"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("content.xml", _MINIMAL_XML)
    siq_path.write_bytes(buf.getvalue())
    return siq_path


@pytest.fixture
def minimal_package():
    """In-memory Package with two simple questions; no file I/O needed."""
    return Package(
        name="Test Pack",
        rounds=[
            Round(
                name="Round 1",
                themes=[
                    Theme(
                        name="Animals",
                        questions=[
                            Question(
                                price=100,
                                scenario=[Atom(type="text", content="What sound does a cat make?")],
                                right=["meow"],
                            ),
                            Question(
                                price=200,
                                scenario=[Atom(type="text", content="What sound does a dog make?")],
                                right=["woof"],
                            ),
                        ],
                    )
                ],
            )
        ],
    )
