
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
        "Привет! Я NexoAI — твой ИИ-помощник. Напиши вопрос или попроси меня нарисовать картинку! 🎨"
      );
      return new Response("OK");
    }

    const wantsImage =
      /нарисуй|нарисовать|сгенерируй|создай картин|создай изображ|сделай фото|сделай картин|сделай изображ|generate image|create image|draw a/i.test(userText);

    if (wantsImage) {
      try {
        if (!env.AI) {
          throw new Error("AI binding is not configured");
        }

        await sendTelegram(
          env.TELEGRAM_TOKEN,
          chatId,
          "🎨 Создаю изображение. Это может занять немного времени..."
        );

        const prompt = userText
          .replace(/^\/image\s*/i, "")
          .slice(0, 2000);

        const result = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt,
            steps: 4
          }
        );

        if (!result?.image) {
          throw new Error("Image model returned no image");
        }

        const binary = atob(result.image);
        const bytes = Uint8Array.from(
          binary,
          character => character.charCodeAt(0)
        );

        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append(
          "photo",
          new Blob([bytes], { type: "image/jpeg" }),
          "nexoai.jpg"
        );
        form.append("caption", "✨ Создано с помощью NexoAI");

        const response = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendPhoto`,
          {
            method: "POST",
            body: form
          }
        );

        if (!response.ok) {
          throw new Error("Telegram sendPhoto failed");
        }

      } catch (error) {
        await sendTelegram(
          env.TELEGRAM_TOKEN,
          chatId,
          "Не удалось создать изображение. Возможно, временно недоступна модель или исчерпана бесплатная квота. Попробуй позже."
        );
      }

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
                content: "Ты NexoAI, полезный ИИ-помощник. Отвечай на русском, если пользователь пишет по-русски. Будь понятным и доброжелательным."
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
        "Не получилось получить ответ от ИИ. Попробуй ещё раз позже."
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
