import { createConnection } from "node:net";
import { emailConfig } from "./config";

export type SessionEmailJob = {
  customerName: string;
  email: string;
  sessionLink: string;
};

export async function sendSessionLinkEmail({ customerName, email, sessionLink }: SessionEmailJob) {
  const subject = "Return to your SupportOps chat";
  const text = `Hi ${customerName},\n\nReturn to your support chat: ${sessionLink}`;

  if (emailConfig.resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({ from: emailConfig.from, html: `<p>Hi ${escapeHtml(customerName)},</p><p><a href="${escapeHtml(sessionLink)}">Return to your support chat</a></p>`, subject, text, to: [email] }),
      headers: { Authorization: `Bearer ${emailConfig.resendApiKey}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Resend rejected the Session Link email (${response.status}).`);
    return;
  }

  if (!emailConfig.smtpUrl) throw new Error("Configure RESEND_API_KEY or SMTP_URL to deliver Session Link emails.");
  await sendSmtpMessage(emailConfig.smtpUrl, email, subject, text);
}

async function sendSmtpMessage(smtpUrl: string, recipient: string, subject: string, text: string) {
  const url = new URL(smtpUrl);
  if (url.protocol !== "smtp:") throw new Error("SMTP_URL must use smtp://.");

  const socket = createConnection({ host: url.hostname, port: Number(url.port || 25) });
  const read = createSmtpReader(socket);
  await onceConnected(socket);
  await read();
  await command(socket, read, "EHLO supportops");
  await command(socket, read, `MAIL FROM:<${emailAddress(emailConfig.from)}>`);
  await command(socket, read, `RCPT TO:<${recipient}>`);
  await command(socket, read, "DATA");
  await command(socket, read, `From: ${emailConfig.from}\r\nTo: ${recipient}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text.replace(/^\./gm, "..")}\r\n.`);
  await command(socket, read, "QUIT");
  socket.end();
}

function createSmtpReader(socket: ReturnType<typeof createConnection>) {
  let buffered = "";
  const responses: Array<(response: string) => void> = [];
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffered += chunk;
    if (!/\r?\n$/.test(buffered) || !/^\d{3} /m.test(buffered)) return;
    const response = buffered;
    buffered = "";
    responses.shift()?.(response);
  });
  return () =>
    new Promise<string>((resolve) => {
      if (/\r?\n$/.test(buffered) && /^\d{3} /m.test(buffered)) {
        const response = buffered;
        buffered = "";
        resolve(response);
        return;
      }
      responses.push(resolve);
    });
}

async function command(socket: ReturnType<typeof createConnection>, read: () => Promise<string>, value: string) {
  socket.write(`${value}\r\n`);
  const response = await read();
  if (!/^2\d\d|^3\d\d/.test(response)) throw new Error(`SMTP rejected command: ${response}`);
}

function onceConnected(socket: ReturnType<typeof createConnection>) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}

function emailAddress(from: string) {
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
