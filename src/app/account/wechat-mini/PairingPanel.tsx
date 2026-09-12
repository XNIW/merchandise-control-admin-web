"use client";

import { useState } from "react";

const messages = {
  en: {
    title: "Link this personal account to WeChat Mini",
    start: "Start linking",
    intent: "I want to link my WeChat identity to this personal account.",
    transfer:
      "Enter this code only in your MerchandiseControl Mini Program. It expires in five minutes.",
    refresh: "Check Mini confirmation",
    compare: "Compare this number with the one shown in your Mini Program.",
    consent: "Both account and comparison number match on my devices.",
    approve: "Approve this link",
    next: "Now confirm in the Mini Program with a fresh WeChat login.",
    linked:
      "Linked. You can sign in from the Mini Program when pilot login is enabled.",
    cancel: "Cancel pairing",
    error:
      "The operation could not be completed. Check your personal session and restart pairing if it expired.",
    mappings: "Existing Mini links",
    load: "Show links",
    unlink: "Unlink and revoke Mini sessions",
    revoke: "I want to revoke this Mini link and its sessions.",
    disabled: "Mini enrollment is not enabled.",
    back: "Account profile",
  },
  it: {
    title: "Collega questo account personale a WeChat Mini",
    start: "Avvia collegamento",
    intent:
      "Voglio collegare la mia identità WeChat a questo account personale.",
    transfer:
      "Inserisci questo codice solo nel tuo Mini Program MerchandiseControl. Scade fra cinque minuti.",
    refresh: "Controlla la conferma Mini",
    compare:
      "Confronta questo numero con quello mostrato nel tuo Mini Program.",
    consent:
      "Account e numero di confronto corrispondono sui miei dispositivi.",
    approve: "Approva collegamento",
    next: "Conferma ora nel Mini Program con un nuovo login WeChat.",
    linked:
      "Collegato. Potrai accedere dal Mini quando il login pilot sarà abilitato.",
    cancel: "Annulla pairing",
    error:
      "Operazione non completata. Controlla la sessione personale e riavvia il pairing se è scaduto.",
    mappings: "Collegamenti Mini esistenti",
    load: "Mostra collegamenti",
    unlink: "Scollega e revoca le sessioni Mini",
    revoke: "Voglio revocare questo collegamento Mini e le sue sessioni.",
    disabled: "Enrollment Mini non abilitato.",
    back: "Profilo account",
  },
  es: {
    title: "Vincular esta cuenta personal a WeChat Mini",
    start: "Iniciar vinculación",
    intent: "Quiero vincular mi identidad WeChat a esta cuenta personal.",
    transfer:
      "Introduce este código solo en tu Mini Program MerchandiseControl. Caduca en cinco minutos.",
    refresh: "Consultar confirmación Mini",
    compare: "Compara este número con el mostrado en tu Mini Program.",
    consent: "La cuenta y el número coinciden en mis dispositivos.",
    approve: "Aprobar vínculo",
    next: "Confirma ahora en el Mini Program con un nuevo inicio de sesión WeChat.",
    linked:
      "Vinculado. Podrás acceder desde el Mini cuando se habilite el piloto.",
    cancel: "Cancelar vinculación",
    error:
      "No se completó la operación. Comprueba la sesión personal y reinicia si ha caducado.",
    mappings: "Vínculos Mini existentes",
    load: "Mostrar vínculos",
    unlink: "Desvincular y revocar sesiones Mini",
    revoke: "Quiero revocar este vínculo Mini y sus sesiones.",
    disabled: "Vinculación Mini no habilitada.",
    back: "Perfil de cuenta",
  },
  "zh-CN": {
    title: "将此个人账户关联至微信小程序",
    start: "开始关联",
    intent: "我希望将自己的微信身份关联至此个人账户。",
    transfer:
      "仅在你自己的 MerchandiseControl 小程序中输入此代码。五分钟后失效。",
    refresh: "查看小程序确认状态",
    compare: "请与自己小程序中显示的数字进行比较。",
    consent: "我的两个设备上显示的账户和比较数字均一致。",
    approve: "批准关联",
    next: "现在请在小程序中确认，并重新进行微信登录。",
    linked: "已关联。试点登录启用后可在小程序登录。",
    cancel: "取消关联",
    error: "操作未完成。请检查个人登录会话；如已过期，请重新开始。",
    mappings: "现有小程序关联",
    load: "显示关联",
    unlink: "解除关联并撤销小程序会话",
    revoke: "我希望撤销此小程序关联及其会话。",
    disabled: "小程序关联尚未启用。",
    back: "账户资料",
  },
};
type Pair = {
  pairingId: string;
  adminCapability: string;
  transferCode: string;
};
type Mapping = { mapping_id: string; provider: string };

export function PairingPanel({
  accountName,
  enabled,
  canManage,
  locale,
}: {
  accountName: string;
  enabled: boolean;
  canManage: boolean;
  locale: string;
}) {
  const text = messages[locale as keyof typeof messages] ?? messages.en;
  const [pair, setPair] = useState<Pair | null>(null);
  const [state, setState] = useState("");
  const [comparison, setComparison] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [revoke, setRevoke] = useState(false);
  async function act(action: string, mappingId?: string) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/wechat/mini/admin", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          consent,
          mappingId,
          ...(action === "unlink" ? { consent: revoke } : {}),
          ...(pair
            ? {
                pairingId: pair.pairingId,
                adminCapability: pair.adminCapability,
              }
            : {}),
        }),
      });
      const data: unknown = await response.json();
      if (
        data &&
        typeof data === "object" &&
        "code" in data &&
        data.code === "pairing_expired"
      ) {
        setPair(null);
        setComparison("");
        setConsent(false);
        setState("");
      }
      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("ok" in data) ||
        data.ok !== true
      )
        throw new Error("pairing_failed");
      const result = data as Record<string, unknown>;
      if (
        action === "start" &&
        typeof result.pairingId === "string" &&
        typeof result.adminCapability === "string" &&
        typeof result.transferCode === "string"
      ) {
        setPair({
          pairingId: result.pairingId,
          adminCapability: result.adminCapability,
          transferCode: result.transferCode,
        });
        setState("waiting");
        setConsent(false);
      }
      if (typeof result.state === "string") setState(result.state);
      if (typeof result.comparison === "string")
        setComparison(result.comparison);
      if (Array.isArray(result.mappings))
        setMappings(
          result.mappings.filter(
            (v): v is Mapping =>
              v &&
              typeof v === "object" &&
              typeof v.mapping_id === "string" &&
              v.provider === "wechat-mini",
          ),
        );
      if (["cancel", "unlink"].includes(action)) {
        setPair(null);
        setComparison("");
        setMappings([]);
        setConsent(false);
        setRevoke(false);
      }
      if (result.state === "linked") {
        setPair(null);
        setComparison("");
        setConsent(false);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const button =
    "rounded border border-emerald-700 px-4 py-2 disabled:opacity-40";
  return (
    <section className="mx-auto grid max-w-xl gap-5 rounded-xl bg-white p-6 text-zinc-950">
      <h1 className="text-2xl font-semibold">{text.title}</h1>
      <p className="font-semibold">{accountName}</p>
      {!enabled ? (
        <p>{text.disabled}</p>
      ) : (
        <>
          {!pair && state !== "linked" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                {text.intent}
              </label>
              <button
                className={button}
                disabled={busy || !consent}
                onClick={() => void act("start")}
              >
                {text.start}
              </button>
            </>
          )}
          {pair && (
            <>
              <p>{text.transfer}</p>
              <code className="break-all select-all rounded bg-zinc-100 p-3">
                {pair.transferCode}
              </code>
              <button
                className={button}
                disabled={busy}
                onClick={() => void act("status")}
              >
                {text.refresh}
              </button>
              {comparison && state !== "waiting" && (
                <>
                  <p>{text.compare}</p>
                  <strong className="text-3xl tracking-widest">
                    {comparison}
                  </strong>
                </>
              )}
              {state === "claimed" && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    {text.consent}
                  </label>
                  <button
                    className={button}
                    disabled={busy || !consent}
                    onClick={() => void act("approve")}
                  >
                    {text.approve}
                  </button>
                </>
              )}
              {state === "approved" && <p>{text.next}</p>}
              <button
                className={button}
                disabled={busy}
                onClick={() => void act("cancel")}
              >
                {text.cancel}
              </button>
            </>
          )}
          {state === "linked" && <p role="status">{text.linked}</p>}
        </>
      )}
      {canManage && (
        <>
          <h2 className="font-semibold">{text.mappings}</h2>
          <button
            className={button}
            disabled={busy}
            onClick={() => void act("list")}
          >
            {text.load}
          </button>
          {mappings.length > 0 && (
            <label>
              <input
                type="checkbox"
                checked={revoke}
                onChange={(e) => setRevoke(e.target.checked)}
              />{" "}
              {text.revoke}
            </label>
          )}
          {mappings.map((m) => (
            <button
              key={m.mapping_id}
              className={button}
              disabled={busy || !revoke}
              onClick={() => void act("unlink", m.mapping_id)}
            >
              {text.unlink}
            </button>
          ))}
        </>
      )}
      {error && <p role="alert">{text.error}</p>}
      <a href="/account/profile" className="underline">
        {text.back}
      </a>
    </section>
  );
}
