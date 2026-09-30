export default {
  async fetch(req, env) {
    await env.MY_QUEUE.send({
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers),
    });
    return new Response('Sent!');
  },
};