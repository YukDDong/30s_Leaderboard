import {
  calculateStandings,
  findMatchByTeams,
  formatMatchScoreForTeams,
  getMatchOutcomeForTeam,
  getOutcomeLabel,
  getSummaryCards,
} from "./league.js";

export function Message({ as: Component = "p", className = "inline-message", message }) {
  return (
    <Component className={className} data-tone={message?.text ? message.tone : undefined}>
      {message?.text || ""}
    </Component>
  );
}

export function ConfigNotice({ message }) {
  if (!message?.text) {
    return null;
  }

  return (
    <section className="panel status-panel" aria-live="polite">
      <Message className="status-banner" message={message} />
    </section>
  );
}

export function SummaryCards({ teams, matches }) {
  return (
    <div className="summary-grid">
      {getSummaryCards(teams, matches).map((card) => (
        <article className="summary-card" key={card.label}>
          <span className="summary-label">{card.label}</span>
          <strong className="summary-value">{card.value}</strong>
          <span className="summary-note">{card.note}</span>
        </article>
      ))}
    </div>
  );
}

export function TeamsList({ teams, showRemoveButton = false, disableRemoveButton = false, onRemoveTeam }) {
  if (teams.length === 0) {
    return (
      <div className="stack-list">
        <EmptyState
          title="아직 등록된 팀이 없습니다."
          description="관리자 인증 후 먼저 팀을 등록한 뒤 경기 일정을 생성하세요."
        />
      </div>
    );
  }

  return (
    <div className="stack-list">
      {teams.map((team, index) => (
        <article className="team-item" key={team.id}>
          <div className="team-meta">
            <div className="team-head">
              <span className="team-index-chip">{index + 1}</span>
              <strong className="team-name">{team.name}</strong>
            </div>
          </div>
          {showRemoveButton ? (
            <button
              className="secondary-button"
              type="button"
              disabled={disableRemoveButton}
              onClick={() => onRemoveTeam?.(team)}
            >
              삭제
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function MatchesMatrix({
  teams,
  matches,
  editable = false,
  pendingLabel = "입력",
  onOpenMatch,
}) {
  if (matches.length === 0) {
    return (
      <div className="matches-table-shell">
        <EmptyState
          title="아직 생성된 경기가 없습니다."
          description="팀을 2개 이상 등록한 뒤 경기 생성 버튼을 눌러 일정 목록을 만드세요."
        />
      </div>
    );
  }

  return (
    <div className="matches-table-shell">
      <div className="table-wrap matrix-table-wrap">
        <table className="matches-table matrix-table">
          <caption className="sr-only">
            {editable
              ? "팀 간 대진 교차표입니다. 클릭 가능한 셀에서 점수 입력 또는 수정 모달이 열립니다."
              : "팀 간 대진 교차표입니다. 보기 전용으로 최신 경기 결과만 표시합니다."}
          </caption>
          <thead>
            <tr>
              <th className="matrix-corner" scope="col">
                <span className="matrix-corner-label">대진표</span>
                <span className="matrix-corner-note">행 팀 vs 열 팀</span>
              </th>
              {teams.map((team, index) => (
                <th className="matrix-team-head" scope="col" key={team.id}>
                  <span className="team-index-badge">{index + 1}</span>
                  <span className="matrix-team-name" title={team.name}>
                    {team.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((rowTeam, rowIndex) => (
              <tr key={rowTeam.id}>
                <th className="matrix-side-head" scope="row">
                  <span className="team-index-badge">{rowIndex + 1}</span>
                  <span className="matrix-team-name" title={rowTeam.name}>
                    {rowTeam.name}
                  </span>
                </th>
                {teams.map((columnTeam, columnIndex) => (
                  <MatchCell
                    columnIndex={columnIndex}
                    columnTeam={columnTeam}
                    editable={editable}
                    key={columnTeam.id}
                    matches={matches}
                    onOpenMatch={onOpenMatch}
                    pendingLabel={pendingLabel}
                    rowIndex={rowIndex}
                    rowTeam={rowTeam}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StandingsTable({ teams, matches }) {
  const standings = calculateStandings(teams, matches);

  return (
    <div className="table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>팀명</th>
            <th>경기수</th>
            <th>승점</th>
            <th>승</th>
            <th>무</th>
            <th>패</th>
            <th>득점</th>
            <th>실점</th>
            <th>득실차</th>
          </tr>
        </thead>
        <tbody>
          {teams.length === 0 ? (
            <tr>
              <td colSpan="10">팀을 등록하면 순위표가 이곳에 표시됩니다.</td>
            </tr>
          ) : (
            standings.map((teamStats, index) => (
              <tr key={teamStats.team}>
                <td>{index + 1}</td>
                <td>{teamStats.team}</td>
                <td>{teamStats.played}</td>
                <td>{teamStats.points}</td>
                <td>{teamStats.wins}</td>
                <td>{teamStats.draws}</td>
                <td>{teamStats.losses}</td>
                <td>{teamStats.goalsFor}</td>
                <td>{teamStats.goalsAgainst}</td>
                <td>{teamStats.goalDiff}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <article className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </article>
  );
}

function MatchCell({
  columnIndex,
  columnTeam,
  editable,
  matches,
  onOpenMatch,
  pendingLabel,
  rowIndex,
  rowTeam,
}) {
  if (rowIndex === columnIndex) {
    return <td aria-hidden="true" className="matrix-diagonal" />;
  }

  const match = findMatchByTeams(matches, rowTeam.id, columnTeam.id);

  if (!match) {
    return <td className="matrix-muted" />;
  }

  const outcomeClass = getMatchOutcomeForTeam(match, rowTeam.id);
  const isInteractiveCell = editable && columnIndex > rowIndex;
  const scoreLabel = formatMatchScoreForTeams(match, rowTeam.id, columnTeam.id, pendingLabel);
  const outcomeLabel = getOutcomeLabel(match, rowTeam.id, pendingLabel);

  if (!isInteractiveCell) {
    return (
      <td className={`matrix-match-cell readonly ${outcomeClass}`}>
        <div className={`matrix-cell-display ${outcomeClass}`}>
          <span className="matrix-cell-score">{scoreLabel}</span>
          <span className="matrix-cell-state">{outcomeLabel}</span>
        </div>
      </td>
    );
  }

  return (
    <td className={`matrix-match-cell ${outcomeClass}`}>
      <button
        aria-label={`${rowTeam.name} 대 ${columnTeam.name} 경기 ${
          match.isPlayed ? `${scoreLabel} 수정` : "점수 입력"
        }`}
        className={`matrix-cell-button ${outcomeClass}`}
        type="button"
        onClick={() => onOpenMatch?.(match.id)}
      >
        <span className="matrix-cell-score">{scoreLabel}</span>
        <span className="matrix-cell-state">{outcomeLabel}</span>
      </button>
    </td>
  );
}
