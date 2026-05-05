export default function handler(req, res) {
  res.status(200).json({
    server: "online",
    players: 10
  });
}
