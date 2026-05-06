import React, { useEffect, useState } from "react";
import { Message } from "../../../shared/components.jsx";

export function LeagueTournamentForm({
  errors,
  onGenerate,
  onTeamChange,
  onTournamentNameChange,
  teams,
  tournamentName,
  warnings,
}) {
  return (
    <section className="panel wide-panel" aria-labelledby="league-tournament-form-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Setup</p>
          <h2 id="league-tournament-form-heading">대회 정보 입력</h2>
        </div>
      </div>

      <form className="league-tournament-form" noValidate onSubmit={onGenerate}>
        <label className="input-group">
          <span>대회명</span>
          <input
            maxLength="50"
            placeholder="예: 5월 정기 복식 리그"
            type="text"
            value={tournamentName}
            onChange={(event) => onTournamentNameChange(event.target.value)}
          />
        </label>

        <div className="league-team-input-grid" aria-label="복식 팀 6개 입력">
          {teams.map((team, index) => (
            <fieldset className="league-team-fieldset" key={team.id}>
              <legend>팀 {index + 1}</legend>
              <label className="input-group">
                <span>팀명</span>
                <input
                  maxLength="30"
                  placeholder="예: 강동 에이스"
                  type="text"
                  value={team.name}
                  onChange={(event) => onTeamChange(team.id, "name", event.target.value)}
                />
              </label>
              <div className="league-player-input-grid">
                <label className="input-group">
                  <span>선수 1 이름</span>
                  <input
                    maxLength="20"
                    placeholder="선수 1"
                    type="text"
                    value={team.player1Name}
                    onChange={(event) => onTeamChange(team.id, "player1Name", event.target.value)}
                  />
                </label>
                <label className="input-group">
                  <span>선수 2 이름</span>
                  <input
                    maxLength="20"
                    placeholder="선수 2"
                    type="text"
                    value={team.player2Name}
                    onChange={(event) => onTeamChange(team.id, "player2Name", event.target.value)}
                  />
                </label>
              </div>
            </fieldset>
          ))}
        </div>

        <div className="league-form-footer">
          <button className="primary-button" type="submit">
            운영표 생성
          </button>
        </div>
      </form>

      <MessageList items={errors} tone="danger" />
      <MessageList items={warnings} tone="warning" />
    </section>
  );
}

export function PreliminaryGroups({ groups }) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="panel wide-panel" aria-labelledby="preliminary-groups-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Groups</p>
          <h2 id="preliminary-groups-heading">조 편성</h2>
        </div>
        <p className="section-description">입력 순서 기준: 앞 3팀 A조, 뒤 3팀 B조</p>
      </div>

      <div className="league-group-grid">
        {groups.map((group) => (
          <article className="league-group-card" key={group.id}>
            <h3>{group.name}</h3>
            <div className="stack-list">
              {group.teams.map((team, index) => (
                <article className="team-item" key={team.id}>
                  <div className="team-meta">
                    <div className="team-head">
                      <span className="team-index-chip">{group.id}{index + 1}</span>
                      <strong className="team-name">{team.name}</strong>
                    </div>
                    <span className="league-player-line">{formatTeamPlayers(team)}</span>
                  </div>
                </article>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PreliminaryMatchList({ groups, matches, message, onScoreChange }) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="panel wide-panel" aria-labelledby="preliminary-matches-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Preliminary</p>
          <h2 id="preliminary-matches-heading">예선 경기 결과</h2>
        </div>
      </div>

      <div className="league-group-grid">
        {groups.map((group) => (
          <article className="league-match-card" key={group.id}>
            <h3>{group.name} 예선</h3>
            <div className="league-match-list">
              {matches
                .filter((match) => match.groupId === group.id)
                .map((match, index) => (
                  <article className="league-match-row" key={match.id}>
                    <div className="league-match-meta">
                      <span className="modal-match-number">{index + 1}경기</span>
                      <strong>{match.team1.name} vs {match.team2.name}</strong>
                      <span className="league-player-line">
                        {formatTeamPlayers(match.team1)} / {formatTeamPlayers(match.team2)}
                      </span>
                    </div>
                    <ScoreInputs
                      label1={match.team1.name}
                      label2={match.team2.name}
                      score1={match.team1Score}
                      score2={match.team2Score}
                      onScore1Change={(value) => onScoreChange(match.id, "team1Score", value)}
                      onScore2Change={(value) => onScoreChange(match.id, "team2Score", value)}
                    />
                    <MatchResultBadge match={match} />
                  </article>
                ))}
            </div>
          </article>
        ))}
      </div>
      <Message message={message} />
    </section>
  );
}

export function GroupStandingsTable({ group, standings }) {
  return (
    <section className="panel wide-panel" aria-labelledby={`standings-${group.id}-heading`}>
      <div className="section-header">
        <div>
          <p className="section-kicker">Standings</p>
          <h2 id={`standings-${group.id}-heading`}>{group.name} 순위표</h2>
        </div>
      </div>

      <div className="table-wrap">
        <table className="standings-table league-standings-table">
          <thead>
            <tr>
              <th>순위</th>
              <th>팀명</th>
              <th>선수</th>
              <th>경기수</th>
              <th>승</th>
              <th>패</th>
              <th>득점</th>
              <th>실점</th>
              <th>득실차</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.team.id} data-review={row.needsTiebreakReview ? "true" : undefined}>
                <td>{formatRank(row)}</td>
                <td>{row.team.name}</td>
                <td>{formatTeamPlayers(row.team)}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.pointsFor}</td>
                <td>{row.pointsAgainst}</td>
                <td>{row.pointDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SixTeamTournamentBracket({ message, matches, onSaveScore, standingsReady }) {
  if (matches.length === 0) {
    return null;
  }

  const roundGroups = [
    { id: "quarterfinal", title: "6강" },
    { id: "semifinal", title: "4강" },
    { id: "final", title: "결승" },
  ];

  return (
    <section className="panel wide-panel" aria-labelledby="tournament-bracket-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Tournament</p>
          <h2 id="tournament-bracket-heading">본선 대진표</h2>
        </div>
        <p className="section-description">
          {standingsReady ? "예선 순위 확정 완료" : "예선 순위 확정 전 placeholder 표시"}
        </p>
      </div>

      <div className="league-bracket-grid">
        {roundGroups.map((round) => (
          <div className="league-round-column" key={round.id}>
            <h3>{round.title}</h3>
            {matches
              .filter((match) => match.round === round.id)
              .map((match) => (
                <TournamentMatchCard
                  key={match.id}
                  match={match}
                  onSaveScore={onSaveScore}
                />
              ))}
          </div>
        ))}
      </div>
      <Message message={message} />
    </section>
  );
}

export function ChampionCard({ champion }) {
  if (!champion) {
    return null;
  }

  return (
    <section className="panel wide-panel champion-panel" aria-labelledby="champion-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Champion</p>
          <h2 id="champion-heading">우승팀</h2>
        </div>
      </div>
      <article className="champion-card">
        <strong>{champion.name}</strong>
        <span>{formatTeamPlayers(champion)}</span>
      </article>
    </section>
  );
}

function TournamentMatchCard({ match, onSaveScore }) {
  const winner = [match.team1, match.team2].find((team) => team?.id === match.winnerTeamId);
  const canInputScore = Boolean(match.team1 && match.team2);

  return (
    <article className="league-tournament-match-card">
      <div className="league-match-meta">
        <span className="modal-match-number">{match.name}</span>
        <strong>{formatSlotTeam(match.team1, match.team1Slot)} vs {formatSlotTeam(match.team2, match.team2Slot)}</strong>
      </div>

      <div className="league-bracket-team-grid">
        <TeamSlot team={match.team1} slot={match.team1Slot} />
        <TeamSlot team={match.team2} slot={match.team2Slot} />
      </div>

      <TournamentScoreForm
        disabled={!canInputScore}
        match={match}
        onSaveScore={onSaveScore}
      />

      <div className="league-result-stack">
        <span className={`match-badge ${match.status === "completed" ? "played" : "pending"}`}>
          {match.status === "completed" ? "입력 완료" : "대기"}
        </span>
        <span className="league-player-line">
          승자: {winner ? winner.name : "-"}
        </span>
        <span className="league-player-line">
          다음 라운드 반영 상태: {formatNextRoundStatus(match)}
        </span>
      </div>
    </article>
  );
}

function TournamentScoreForm({ disabled, match, onSaveScore }) {
  const [score1, setScore1] = useState(formatScoreValue(match.team1Score));
  const [score2, setScore2] = useState(formatScoreValue(match.team2Score));

  useEffect(() => {
    setScore1(formatScoreValue(match.team1Score));
    setScore2(formatScoreValue(match.team2Score));
  }, [match.team1Score, match.team2Score, match.team1?.id, match.team2?.id]);

  function handleSubmit(event) {
    event.preventDefault();
    onSaveScore(match.id, score1, score2);
  }

  return (
    <form className="league-score-form" noValidate onSubmit={handleSubmit}>
      <ScoreInputs
        disabled={disabled}
        label1={match.team1?.name || match.team1Slot}
        label2={match.team2?.name || match.team2Slot}
        score1={score1}
        score2={score2}
        useRawValues
        onScore1Change={setScore1}
        onScore2Change={setScore2}
      />
      <button className="secondary-button" disabled={disabled} type="submit">
        반영
      </button>
    </form>
  );
}

function ScoreInputs({
  disabled = false,
  label1,
  label2,
  onScore1Change,
  onScore2Change,
  score1,
  score2,
  useRawValues = false,
}) {
  return (
    <div className="league-score-grid">
      <label className="input-group">
        <span>{label1}</span>
        <input
          disabled={disabled}
          inputMode="numeric"
          min="0"
          placeholder="0"
          step="1"
          type="number"
          value={useRawValues ? score1 : formatScoreValue(score1)}
          onChange={(event) => onScore1Change(event.target.value)}
        />
      </label>
      <span className="modal-score-divider">:</span>
      <label className="input-group">
        <span>{label2}</span>
        <input
          disabled={disabled}
          inputMode="numeric"
          min="0"
          placeholder="0"
          step="1"
          type="number"
          value={useRawValues ? score2 : formatScoreValue(score2)}
          onChange={(event) => onScore2Change(event.target.value)}
        />
      </label>
    </div>
  );
}

function MatchResultBadge({ match }) {
  const winner = [match.team1, match.team2].find((team) => team.id === match.winnerTeamId);

  return (
    <div className="league-result-stack">
      <span className={`match-badge ${match.status === "completed" ? "played" : "pending"}`}>
        {match.status === "completed" ? "입력 완료" : "대기"}
      </span>
      <span className="league-player-line">승자: {winner ? winner.name : "-"}</span>
    </div>
  );
}

function TeamSlot({ team, slot }) {
  return (
    <div className="league-team-slot">
      <strong>{team ? team.name : slotLabel(slot)}</strong>
      <span>{team ? formatTeamPlayers(team) : "순위 확정 후 반영"}</span>
    </div>
  );
}

function MessageList({ items, tone }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="league-message-list">
      {items.map((item) => (
        <Message key={item} message={{ text: item, tone }} />
      ))}
    </div>
  );
}

function formatRank(row) {
  if (row.needsTiebreakReview) {
    return "동률 확인 필요";
  }

  return row.rank === null ? "-" : row.rank;
}

function formatNextRoundStatus(match) {
  if (match.status !== "completed") {
    return "대기";
  }

  return match.nextMatchId ? "반영 완료" : "우승 확정";
}

function formatSlotTeam(team, slot) {
  return team ? team.name : slotLabel(slot);
}

function slotLabel(slot) {
  return {
    A1: "A조 1위",
    A2: "A조 2위",
    A3: "A조 3위",
    B1: "B조 1위",
    B2: "B조 2위",
    B3: "B조 3위",
    W_QF1: "6강 1경기 승자",
    W_QF2: "6강 2경기 승자",
    W_SF1: "4강 1경기 승자",
    W_SF2: "4강 2경기 승자",
    TBD: "미정",
  }[slot] || "미정";
}

function formatTeamPlayers(team) {
  return `${team.player1Name} / ${team.player2Name}`;
}

function formatScoreValue(score) {
  if (typeof score === "string") {
    return score;
  }

  return Number.isInteger(score) ? String(score) : "";
}
