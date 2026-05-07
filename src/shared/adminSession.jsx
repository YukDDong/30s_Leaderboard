import React, { useEffect, useState } from "react";
import {
  callAdminFunction,
  getMissingConfigKeys,
  isSupabaseConfigured,
  verifyAdminPassword,
} from "./supabaseClient.js";
import { ConfigNotice, Message } from "./components.jsx";

export const ADMIN_SESSION_KEYS = {
  token: "admin_session_token",
  expiresAt: "admin_session_expires_at",
};

export function loadAdminSession() {
  return {
    token: localStorage.getItem(ADMIN_SESSION_KEYS.token) || "",
    expiresAt: localStorage.getItem(ADMIN_SESSION_KEYS.expiresAt) || "",
  };
}

export function saveAdminSession(token, expiresAt) {
  localStorage.setItem(ADMIN_SESSION_KEYS.token, token);
  localStorage.setItem(ADMIN_SESSION_KEYS.expiresAt, expiresAt);
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEYS.token);
  localStorage.removeItem(ADMIN_SESSION_KEYS.expiresAt);
}

export function isAdminSessionValid() {
  const session = loadAdminSession();

  if (!session.token || !session.expiresAt) {
    return false;
  }

  const expiresAtTime = Date.parse(session.expiresAt);

  if (Number.isNaN(expiresAtTime) || expiresAtTime <= Date.now()) {
    clearAdminSession();
    return false;
  }

  return true;
}

export async function restoreAdminSession() {
  const session = loadAdminSession();
  await callAdminFunction("session_status", {}, session.token);
  return session;
}

export function AdminAccessGate({ children, heading = "관리자 인증", onLogout }) {
  const [authMessage, setAuthMessage] = useState({ text: "", tone: "warning" });
  const [configMessage, setConfigMessage] = useState({ text: "", tone: "warning" });
  const [isChecking, setIsChecking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const configMissing = !isSupabaseConfigured();

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      const missingKeys = getMissingConfigKeys().join(", ");
      setConfigMessage({
        text: `Supabase 설정이 비어 있습니다. config.js의 ${missingKeys} 값을 채운 뒤 관리자 인증을 진행해 주세요.`,
        tone: "warning",
      });
      setIsUnlocked(false);
      return;
    }

    if (!isAdminSessionValid()) {
      setIsUnlocked(false);
      return;
    }

    setIsChecking(true);
    setAuthMessage({ text: "이전 관리자 세션을 확인하는 중입니다.", tone: "warning" });
    restoreAdminSession()
      .then(() => {
        setIsUnlocked(true);
        setAuthMessage({ text: "", tone: "warning" });
      })
      .catch(() => {
        clearAdminSession();
        setIsUnlocked(false);
        setAuthMessage({
          text: "관리자 세션이 만료되었거나 유효하지 않습니다. 다시 비밀번호를 입력해 주세요.",
          tone: "warning",
        });
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, []);

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "").trim();

    if (!password) {
      setAuthMessage({ text: "비밀번호를 입력해 주세요.", tone: "danger" });
      return;
    }

    setIsChecking(true);
    setAuthMessage({ text: "관리자 비밀번호를 검증하는 중입니다.", tone: "warning" });

    try {
      const result = await verifyAdminPassword(password);
      saveAdminSession(result.token, result.expiresAt);
      form.reset();
      setIsUnlocked(true);
      setAuthMessage({ text: "인증에 성공했습니다.", tone: "success" });
    } catch (error) {
      setAuthMessage({
        text: error.message || "비밀번호 검증에 실패했습니다. Edge Function 설정을 확인해 주세요.",
        tone: "danger",
      });
    } finally {
      setIsChecking(false);
    }
  }

  function handleLogout() {
    clearAdminSession();
    setIsUnlocked(false);
    setAuthMessage({ text: "로그아웃되었습니다. 다시 비밀번호를 입력해 주세요.", tone: "warning" });
    onLogout?.();
  }

  return (
    <>
      <ConfigNotice message={configMessage} />
      {isUnlocked ? children({ isChecking, handleLogout }) : (
        <section className="panel auth-panel" aria-labelledby="auth-heading">
          <div className="section-header">
            <div>
              <p className="section-kicker">Access</p>
              <h2 id="auth-heading">{heading}</h2>
            </div>
          </div>
          <form className="auth-form" noValidate onSubmit={handlePasswordSubmit}>
            <label className="input-group">
              <span>관리자 비밀번호</span>
              <input
                autoComplete="current-password"
                disabled={isChecking || configMissing}
                name="password"
                placeholder="비밀번호 입력"
                type="password"
              />
            </label>
            <button className="primary-button" disabled={isChecking || configMissing} type="submit">
              인증
            </button>
          </form>
          <Message message={authMessage} />
        </section>
      )}
    </>
  );
}
