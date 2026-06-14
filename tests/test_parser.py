"""Parser tests — loading .siq archives and verifying the parsed structure."""

from backend.parser import Atom, load


def test_load_returns_correct_package_name(minimal_siq):
    pkg = load(minimal_siq).package
    assert pkg.name == "Test Pack"
    assert pkg.difficulty == 5


def test_load_round_structure(minimal_siq):
    rounds = load(minimal_siq).package.rounds
    assert len(rounds) == 1
    assert rounds[0].name == "Round 1"
    assert not rounds[0].is_final


def test_load_theme_and_questions(minimal_siq):
    theme = load(minimal_siq).package.rounds[0].themes[0]
    assert theme.name == "Animals"
    assert len(theme.questions) == 2
    q0, q1 = theme.questions
    assert q0.price == 100
    assert q0.right == ["meow"]
    assert q1.price == 200
    assert q1.right == ["woof"]


def test_load_question_scenario(minimal_siq):
    q = load(minimal_siq).package.rounds[0].themes[0].questions[0]
    assert len(q.scenario) == 1
    atom = q.scenario[0]
    assert atom.type == "text"
    assert "cat" in atom.content


def test_atom_is_media_false_for_text():
    assert not Atom(type="text", content="hello").is_media


def test_atom_is_media_true_for_image():
    atom = Atom(type="image", content="photo.jpg")
    assert atom.is_media
    assert atom.media_path == "Images/photo.jpg"


def test_atom_media_path_strips_at_prefix():
    atom = Atom(type="voice", content="@sound.mp3")
    assert atom.media_path == "Audio/sound.mp3"
