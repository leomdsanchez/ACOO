import fs from "node:fs";

const file = process.argv[2];

if (!file) {
  console.error("usage: node scripts/linkedin-snapshot-parse.mjs <snapshot.md>");
  process.exit(1);
}

const raw = fs.readFileSync(file, "utf8");
const lines = raw.split("\n");

const cards = [];
let current = null;

const flush = () => {
  if (!current) return;
  current.snippet = current.snippet.join(" ").replace(/\s+/g, " ").trim().slice(0, 260);
  cards.push(current);
  current = null;
};

for (const line of lines) {
  const feedMatch = line.match(/heading "Número da publicação no feed (\d+)"/);
  if (feedMatch) {
    flush();
    current = {
      id: Number(feedMatch[1]),
      actor: "",
      type: "author_post",
      timestamp: "",
      menuRef: "",
      commentRef: "",
      likeRef: "",
      snippet: [],
    };
    continue;
  }

  if (!current) continue;

  const actorMatch = line.match(/generic \[ref=.*\]: ([^"].+)$/);
  if (!current.actor && line.includes("• 1º") === false && line.includes("Premium") === false && actorMatch) {
    const value = actorMatch[1].trim();
    if (value && !value.startsWith("Há ") && !value.startsWith("CEO") && !value.startsWith("Director")) {
      current.actor = value;
    }
  }

  if (line.includes("text: compartilhou isso")) {
    current.type = "shared_post";
  }

  const timestampMatch = line.match(/generic \[ref=.*\]: (Há .+)/);
  if (!current.timestamp && timestampMatch) {
    current.timestamp = timestampMatch[1].trim();
  }

  const menuMatch = line.match(/button "Abrir menu de controle de publicação .*" \[ref=(e\d+)\]/);
  if (!current.menuRef && menuMatch) {
    current.menuRef = menuMatch[1];
  }

  const commentMatch = line.match(/button "Comentar" \[ref=(e\d+)\]/);
  if (!current.commentRef && commentMatch) {
    current.commentRef = commentMatch[1];
  }

  const likeMatch = line.match(/button "Reagir com gostei" \[ref=(e\d+)\]/);
  if (!current.likeRef && likeMatch) {
    current.likeRef = likeMatch[1];
  }

  const textMatch = line.match(/- text: (.+)$/);
  if (textMatch) {
    current.snippet.push(textMatch[1].trim());
  }
}

flush();

console.log(JSON.stringify(cards, null, 2));
