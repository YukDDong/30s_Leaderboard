import React, { useEffect, useState } from "react";
import { Message } from "../../../shared/components.jsx";

export function LeagueTournamentForm({
  defaultOpen = true,
  disabled = false,
  errors,
  isSubmitting = false,
  onGenerate,
  onTeamChange,
  onTournamentNameChange,
  resetKey,
  statusLabel,
  statusTone,
  teams,
  tournamentName,
  warnings,
}) {
  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      headingId="league-tournament-form-heading"
      kicker="Setup"
      resetKey={resetKey}
      statusLabel={statusLabel}
      statusTone={statusTone}
      summary={tournamentName ? tournamentName : "대회명과 복식 팀 6개를 입력합니다."}
      title="대회 정보 입력"
    >
      <form className="league-tournament-form" noValidate onSubmit={onGenerate}>
        <label className="input-group">
          <span>대회명</span>
          <input
            disabled={disabled}
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
                  disabled={disabled}
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
                    disabled={disabled}
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
                    disabled={disabled}
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
          <button className="primary-button" disabled={disabled || isSubmitting} type="submit">
            {isSubmitting ? "저장 중" : "운영표 생성"}
          </button>
        </div>
      </form>

      <MessageList items={errors} tone="danger" />
      <MessageList items={warnings} tone="warning" />
    </CollapsiblePanel>
  );
}

export function PreliminaryGroups({
  defaultOpen = true,
  groups,
  resetKey,
  statusLabel,
  statusTone,
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      description="입력 순서 기준: 앞 3팀 A조, 뒤 3팀 B조"
      headingId="preliminary-groups-heading"
      kicker="Groups"
      resetKey={resetKey}
      statusLabel={statusLabel}
      statusTone={statusTone}
      summary="A/B조 편성 결과"
      title="조 편성"
    >
      <div className="league-group-grid league-preliminary-match-grid">
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
    </CollapsiblePanel>
  );
}

export function PreliminaryMatchList({
  defaultOpen = true,
  groups,
  matches,
  message,
  onScoreChange,
  resetKey,
  statusLabel,
  statusTone,
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      headingId="preliminary-matches-heading"
      kicker="Preliminary"
      resetKey={resetKey}
      statusLabel={statusLabel}
      statusTone={statusTone}
      summary={`${matches.filter((match) => match.status === "completed").length}/${matches.length} 경기 입력 완료`}
      title="예선 경기 결과"
    >
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
    </CollapsiblePanel>
  );
}

export function GroupStandingsTable({
  defaultOpen = true,
  group,
  resetKey,
  standings,
  statusLabel,
  statusTone,
}) {
  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      headingId={`standings-${group.id}-heading`}
      kicker="Standings"
      resetKey={resetKey}
      statusLabel={statusLabel}
      statusTone={statusTone}
      summary={formatStandingsSummary(standings)}
      title={`${group.name} 순위표`}
    >
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
    </CollapsiblePanel>
  );
}

export function SixTeamTournamentBracket({
  defaultOpen = true,
  message,
  matches,
  onSaveScore,
  resetKey,
  standingsReady,
  statusLabel,
  statusTone,
}) {
  if (matches.length === 0) {
    return null;
  }

  const roundGroups = [
    { id: "quarterfinal", title: "6강" },
    { id: "semifinal", title: "4강" },
    { id: "final", title: "결승" },
  ];

  return (
    <CollapsiblePanel
      defaultOpen={defaultOpen}
      description={standingsReady ? "예선 순위 확정 완료" : "예선 순위 확정 전 placeholder 표시"}
      headingId="tournament-bracket-heading"
      kicker="Tournament"
      resetKey={resetKey}
      statusLabel={statusLabel}
      statusTone={statusTone}
      summary={formatTournamentSummary(matches, standingsReady)}
      title="본선 대진표"
    >
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
    </CollapsiblePanel>
  );
}

export function WorkflowProgress({
  champion,
  flowStep,
  hasGeneratedTournament,
  hasTiebreakReview,
  preliminaryCompletedCount,
  preliminaryTotalCount,
  standingsReady,
  tournamentCompletedCount,
  tournamentTotalCount,
}) {
  const steps = [
    {
      id: "setup",
      label: "대회 정보",
      detail: hasGeneratedTournament ? "운영표 생성 완료" : "팀 6개 입력",
      state: hasGeneratedTournament ? "done" : "current",
    },
    {
      id: "preliminary",
      label: "예선",
      detail:
        preliminaryTotalCount > 0
          ? `${preliminaryCompletedCount}/${preliminaryTotalCount} 경기`
          : "대기",
      state: !hasGeneratedTournament ? "pending" : standingsReady ? "done" : "current",
    },
    {
      id: "tournament",
      label: "본선",
      detail:
        tournamentTotalCount > 0
          ? `${tournamentCompletedCount}/${tournamentTotalCount} 경기`
          : "대기",
      state: !standingsReady ? "pending" : champion ? "done" : "current",
    },
    {
      id: "complete",
      label: "우승",
      detail: champion ? champion.name : "미정",
      state: champion ? "done" : "pending",
    },
  ];

  return (
    <section className="panel wide-panel workflow-panel" aria-labelledby="workflow-heading">
      <div className="section-header">
        <div>
          <p className="section-kicker">Progress</p>
          <h2 id="workflow-heading">진행 단계</h2>
        </div>
        <p className="section-description">{getNextActionText(flowStep, hasTiebreakReview, champion)}</p>
      </div>

      <ol className="workflow-steps" aria-label="대회 진행 단계">
        {steps.map((step, index) => (
          <li className="workflow-step" data-state={step.state} key={step.id}>
            <span className="workflow-step-index">{index + 1}</span>
            <span className="workflow-step-copy">
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
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

function CollapsiblePanel({
  children,
  defaultOpen,
  description = "",
  headingId,
  kicker,
  resetKey,
  statusLabel,
  statusTone = "neutral",
  summary,
  title,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen, resetKey]);

  return (
    <section className={`panel wide-panel collapsible-panel ${isOpen ? "open" : "closed"}`}>
      <button
        aria-controls={`${headingId}-body`}
        aria-expanded={isOpen}
        className="collapsible-panel-toggle"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="collapsible-panel-title">
          <span className="section-kicker">{kicker}</span>
          <span id={headingId} className="collapsible-panel-heading">
            {title}
          </span>
        </span>
        <span className="collapsible-panel-meta">
          {statusLabel ? (
            <span className="collapsible-status-badge" data-tone={statusTone}>
              {statusLabel}
            </span>
          ) : null}
          {summary ? <span className="collapsible-panel-summary">{summary}</span> : null}
          {description ? <span className="section-description">{description}</span> : null}
          <span className="collapsible-panel-icon" aria-hidden="true">
            {isOpen ? "접기" : "열기"}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="collapsible-panel-body" id={`${headingId}-body`}>
          {children}
        </div>
      ) : null}
    </section>
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

function formatStandingsSummary(standings) {
  const reviewCount = standings.filter((row) => row.needsTiebreakReview).length;

  if (reviewCount > 0) {
    return `동률 확인 필요 ${reviewCount}팀`;
  }

  const rankedCount = standings.filter((row) => row.rank !== null).length;

  if (rankedCount === standings.length && standings.length > 0) {
    return "순위 확정";
  }

  return "예선 진행 중";
}

function formatTournamentSummary(matches, standingsReady) {
  if (!standingsReady) {
    return "예선 순위 확정 후 사용";
  }

  const completedCount = matches.filter((match) => match.status === "completed").length;

  return `${completedCount}/${matches.length} 경기 입력 완료`;
}

function getNextActionText(flowStep, hasTiebreakReview, champion) {
  if (champion) {
    return `${champion.name} 우승 확정`;
  }

  if (hasTiebreakReview) {
    return "동률 확인 필요 항목을 먼저 확인하세요.";
  }

  if (flowStep === "setup") {
    return "대회명과 복식 팀 6개를 입력한 뒤 운영표를 생성하세요.";
  }

  if (flowStep === "preliminary") {
    return "예선 경기 점수를 모두 입력하면 본선 대진이 확정됩니다.";
  }

  if (flowStep === "tournament") {
    return "본선 점수를 입력하면 다음 라운드가 자동 반영됩니다.";
  }

  return "대회 진행 상태를 확인하세요.";
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
