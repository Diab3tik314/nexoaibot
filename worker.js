
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("NexoAI is running!");
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const message = update.message;

    if (!message?.text || !message.chat?.id) {
      return new Response("OK");
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();

    if (userText.startsWith("/start")) {
      await sendTelegram(
        env.TELEGRAM_TOKEN,
        chatId,
        "Привет! Я NexoAI — твой ИИ-помощник. Напиши мне вопрос!"
      );
      return new Response("OK");
    }

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://nexoaibot.danil-enin.workers.dev",
            "X-Title": "NexoAI Telegram Bot"
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages: [
              {
                role: "system",
                content:
                  "Ты NexoAI, полезный ИИ-помощник. Отвечай на русском языке, если пользователь пишет по-русски. Объясняй понятно и доброжелательно."
              },
              {
                role: "user",
                content: userText
              }
            ]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error("OpenRouter request failed");
      }

      const answer = data?.choices?.[0]?.message?.content;

      await sendTelegram(
        env.TELEGRAM_TOKEN,
        chatId,
        typeof answer === "string" && answer.trim()
          ? answer.slice(0, 4000)
          : "Не удалось получить ответ. Попробуй ещё раз."
      );
    } catch (error) {
      await sendTelegram(
        env.TELEGRAM_TOKEN,
        chatId,
        "Не получилось получить ответ от ИИ. Попробуй позже."
      );
    }

    return new Response("OK");
  }
};

async function sendTelegram(token, chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 4000)
      })
    }
  );

  if (!response.ok) {
    throw new Error("Telegram sendMessage failed");
  }
}
