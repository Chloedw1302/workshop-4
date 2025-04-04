import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { Node } from "../registry/registry";
import {
  generateRsaKeyPair,
  exportPubKey,
  exportPrvKey,
  rsaDecrypt,
  symDecrypt,
  importPrvKey,
  importSymKey
} from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;

  // Générer les clés RSA
  const keyPair = await generateRsaKeyPair();
  const publicKey = await exportPubKey(keyPair.publicKey);
  const privateKey = await exportPrvKey(keyPair.privateKey);

  // S'enregistrer auprès du registre
  await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
    method: "POST",
    body: JSON.stringify({ nodeId, pubKey: publicKey }),
    headers: { "Content-Type": "application/json" },
  });

  // Routes GET
  onionRouter.get("/status", (_, res) => res.send("live"));

  onionRouter.get("/getLastReceivedEncryptedMessage", (_, res) =>
    res.json({ result: lastReceivedEncryptedMessage })
  );

  onionRouter.get("/getLastReceivedDecryptedMessage", (_, res) =>
    res.json({ result: lastReceivedDecryptedMessage })
  );

  onionRouter.get("/getLastMessageDestination", (_, res) =>
    res.json({ result: lastMessageDestination })
  );

  onionRouter.get("/getPrivateKey", (_, res) =>
    res.json({ result: privateKey })
  );

  // Route principale pour le message
  onionRouter.post("/message", async (req, res) => {
    try {
      const { message }: { message: string } = req.body;
      lastReceivedEncryptedMessage = message;

      // Découper la couche : symKey RSA chiffrée + message chiffré symétriquement
      const encryptedSymKey = message.slice(0, 344);
      const encryptedData = message.slice(344);

      // Déchiffrer la clé symétrique
      const privKeyObj = await importPrvKey(privateKey);
      const symKeyBase64 = await rsaDecrypt(encryptedSymKey, privKeyObj);
      const symKey = await importSymKey(symKeyBase64);

      // Déchiffrer le message
      const decrypted = await symDecrypt(symKeyBase64, encryptedData);
      const destinationStr = decrypted.slice(-10); // Les 10 derniers caractères
      const nextDestination = parseInt(destinationStr, 10);
      const innerMessage = decrypted.slice(0, -10);

      lastReceivedDecryptedMessage = decrypted;
      lastMessageDestination = nextDestination;

      // Rediriger vers le prochain nœud ou utilisateur
      await fetch(`http://localhost:${nextDestination}/message`, {
        method: "POST",
        body: JSON.stringify({ message: innerMessage }),
        headers: { "Content-Type": "application/json" },
      });

      res.status(200).send({ message: "Message forwarded successfully" });
    } catch (err) {
      console.error("❌ Error forwarding message:", err);
      res.status(500).send({ error: "Failed to forward message" });
    }
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(`Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
  });

  return server;
}
