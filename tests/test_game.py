"""GameMachine tests — state transitions, scoring, error cases."""

import pytest

from backend.game import GameError, GameMachine, Phase, Settings
from backend.parser import Package


@pytest.fixture
def game(minimal_package):
    return GameMachine(
        minimal_package,
        player_ids=['p1', 'p2'],
        player_names={'p1': 'Alice', 'p2': 'Bob'},
    )


def _play_question(game, selector, buzzer, correct):
    """Helper: select, open buzzer, buzz, close buzzer, judge."""
    game.select_question(selector, 0, 0)
    game.open_buzzer()
    game.buzz(buzzer)
    game.close_buzzer()
    game.judge_answer(correct)


# -- Initialisation --

def test_initial_phase(game):
    assert game.phase == Phase.BOARD


def test_initial_scores(game):
    assert game.scores == {'p1': 0, 'p2': 0}


def test_initial_active_player(game):
    assert game.active_player_id == 'p1'


def test_no_players_raises():
    with pytest.raises(ValueError, match='At least 1 player'):
        GameMachine(Package(name='x'), player_ids=[], player_names={})


def test_no_rounds_raises(minimal_package):
    minimal_package.rounds.clear()
    with pytest.raises(ValueError, match='no playable'):
        GameMachine(minimal_package, player_ids=['p1'], player_names={'p1': 'Alice'})


# -- Question selection --

def test_select_question_moves_to_question_phase(game):
    phase = game.select_question('p1', 0, 0)
    assert phase == Phase.QUESTION


def test_wrong_player_cannot_select(game):
    with pytest.raises(GameError):
        game.select_question('p2', 0, 0)


def test_cannot_select_out_of_range_theme(game):
    with pytest.raises(GameError):
        game.select_question('p1', 99, 0)


def test_cannot_select_already_played_question(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    game.buzz('p1')
    game.close_buzzer()
    game.judge_answer(True)
    game.advance()
    with pytest.raises(GameError):
        game.select_question('p1', 0, 0)


# -- Buzzer --

def test_buzz_accepted(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    assert game.buzz('p1') is True


def test_buzz_blocked_after_wrong_answer(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    game.buzz('p1')
    game.close_buzzer()
    game.judge_answer(False)
    assert game.phase == Phase.BUZZER_OPEN
    assert game.buzz('p1') is False


# -- Scoring --

def test_correct_answer_adds_score(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    game.buzz('p1')
    game.close_buzzer()
    game.judge_answer(True)
    assert game.scores['p1'] == 100


def test_wrong_answer_subtracts_score(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    game.buzz('p1')
    game.close_buzzer()
    game.judge_answer(False)
    assert game.scores['p1'] == -100


def test_correct_answer_sets_active_player(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    game.buzz('p2')
    game.close_buzzer()
    game.judge_answer(True)
    game.advance()
    assert game.active_player_id == 'p2'


# -- Round lifecycle --

def test_advance_to_round_end(game):
    # Play both questions in the only theme
    for q_idx in range(2):
        game.select_question(game.active_player_id, 0, q_idx)
        game.open_buzzer()
        game.buzz(game.active_player_id)
        game.close_buzzer()
        game.judge_answer(True)
        game.advance()
    assert game.phase == Phase.ROUND_END


def test_next_round_leads_to_game_over_when_no_more_rounds(game):
    for q_idx in range(2):
        game.select_question(game.active_player_id, 0, q_idx)
        game.open_buzzer()
        game.buzz(game.active_player_id)
        game.close_buzzer()
        game.judge_answer(True)
        game.advance()
    assert game.phase == Phase.ROUND_END
    game.next_round()
    assert game.phase == Phase.GAME_OVER


# -- Appeal --

def test_appeal_reverses_wrong_judgment(game):
    game.select_question('p1', 0, 0)
    game.open_buzzer()
    # p1 answers wrong → phase returns to BUZZER_OPEN so p2 can buzz
    game.buzz('p1')
    game.close_buzzer()
    game.judge_answer(False)
    # p2 also answers wrong → no eligible players left → ANSWER_RESULT
    game.buzz('p2')
    game.close_buzzer()
    game.judge_answer(False)
    assert game.phase == Phase.ANSWER_RESULT
    assert game.last_wrong_judged_id == 'p2'
    game.accept_appeal()
    # p2 penalty (-100) reversed and award (+100) applied → net +100 from 0
    assert game.scores['p2'] == 100


# -- Manual score correction --

def test_correct_scores(game):
    game.correct_scores({'p1': 500, 'p2': -200})
    assert game.scores == {'p1': 500, 'p2': -200}


def test_correct_scores_unknown_player(game):
    with pytest.raises(GameError, match='Unknown player'):
        game.correct_scores({'ghost': 100})
