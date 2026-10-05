import "server-only";

/**
 * Flux Server-Sent Events. Le travail continue même si le navigateur se déconnecte :
 * la réponse est enregistrée en base et reste consultable dans « Missions ».
 */
export function sseResponse(work: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => send("ping", {}), 15000);
      work(send)
        .catch((e) => send("error", { message: e instanceof Error ? e.message : "Erreur inconnue." }))
        .finally(() => {
          clearInterval(ping);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              /* déjà fermé */
            }
          }
        });
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
