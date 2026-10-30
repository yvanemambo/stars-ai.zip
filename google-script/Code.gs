// STARS AI — envoie les codes d'inscription depuis ton Gmail
// et note chaque inscrit dans cette Google Sheet.
// Ne change rien ici : colle tout, enregistre, puis déploie en « Application Web ».

const SECRET = "__SECRET__";

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: "bad_json" }); }
  if (d.secret !== SECRET) return out({ ok: false, error: "bad_secret" });

  if (d.action === "ping") return out({ ok: true, quota: MailApp.getRemainingDailyQuota() });

  if (d.action === "send_code") {
    if (MailApp.getRemainingDailyQuota() < 1) return out({ ok: false, error: "quota" });
    MailApp.sendEmail({
      to: d.email,
      subject: "Ton code STARS AI : " + d.code,
      name: "STARS AI",
      body: "Bonjour " + d.name + ",\n\nTon code STARS AI : " + d.code + "\nIl est valable 10 minutes.\n\nSi tu n'as rien demandé, ignore ce message.",
      htmlBody: emailHtml(d.name, d.code)
    });
    save(d.email, d.name, "Code envoyé");
    return out({ ok: true });
  }

  if (d.action === "verified") {
    save(d.email, d.name, "Inscrit ✅");
    return out({ ok: true });
  }

  return out({ ok: false, error: "bad_action" });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean(s) {
  return String(s || "").replace(/^[=+\-@]+/, "").slice(0, 60);
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function save(email, name, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sh.getLastRow() === 0) {
      sh.appendRow(["Date d'inscription", "Prénom", "E-mail", "Statut", "Dernière connexion"]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
    const now = new Date();
    const last = sh.getLastRow();
    const emails = last > 1 ? sh.getRange(2, 3, last - 1, 1).getValues().map(function (r) { return String(r[0]).toLowerCase(); }) : [];
    const i = emails.indexOf(String(email).toLowerCase());
    const done = status.indexOf("Inscrit") === 0;
    if (i < 0) {
      sh.appendRow([now, clean(name), clean(email), status, done ? now : ""]);
    } else {
      const row = i + 2;
      if (name) sh.getRange(row, 2).setValue(clean(name));
      const current = String(sh.getRange(row, 4).getValue());
      if (!(current.indexOf("Inscrit") === 0 && !done)) sh.getRange(row, 4).setValue(status);
      if (done) sh.getRange(row, 5).setValue(now);
    }
  } finally {
    lock.releaseLock();
  }
}

function emailHtml(name, code) {
  return '<div style="background:#070b1f;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:440px;margin:0 auto;background:#111836;border:1px solid #2a3473;border-radius:16px;padding:28px 24px;color:#e9ecfb">' +
    '<div style="font-size:18px;font-weight:bold;letter-spacing:3px">&#10022; STARS <span style="color:#f4c96b">AI</span></div>' +
    '<p style="font-size:16px;margin:24px 0 8px">Bonjour ' + esc(name) + ',</p>' +
    '<p style="font-size:15px;color:#9aa3cf;margin:0 0 20px">Voici ton code pour rejoindre STARS AI :</p>' +
    '<div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#1a1404;background:#f4c96b;border-radius:12px;padding:14px 0;text-align:center">' + esc(code) + '</div>' +
    '<p style="font-size:13px;color:#9aa3cf;margin:20px 0 0">Il est valable 10 minutes. Si tu n\'as rien demandé, ignore simplement ce message.</p>' +
    '</div></div>';
}
