import test from "node:test";
import assert from "node:assert/strict";
import { parseThreadRecord } from "./parsing.js";
import { renderThreadMarkdown } from "./templates.js";

test("renderThreadMarkdown and parseThreadRecord preserve source references", () => {
  const content = renderThreadMarkdown({
    slug: "2026-03-19_teste-thread",
    title: "Teste Thread",
    subject: "validar vínculo de origem",
    objective: "garantir distinção entre sessão e thread operacional",
    people: ["Leonardo Sánchez"],
    groups: [],
    whatsapp: null,
    emails: ["ops@example.com"],
    otherChannels: ["chat web"],
    sourceReferences: [
      {
        channel: "telegram",
        account: "@acoo_bot",
        chatId: "8523829645",
        messageId: "321",
        threadRef: "sessao-inicial",
        note: "origem do assunto",
      },
    ],
    timestamp: "2026-03-19 10:00",
    status: "Aguardando execução",
    nextBlocker: "sem trava",
  });

  assert.match(content, /## Referências de Origem/);
  assert.match(content, /Canal: `telegram`/);
  assert.match(content, /Chat: `8523829645`/);

  const record = parseThreadRecord("/tmp/2026-03-19_teste-thread.md", content, "active");
  assert.equal(record.sourceReferences.length, 1);
  assert.deepEqual(record.sourceReferences[0], {
    channel: "telegram",
    account: "@acoo_bot",
    chatId: "8523829645",
    messageId: "321",
    threadRef: "sessao-inicial",
    note: "origem do assunto",
  });
});
