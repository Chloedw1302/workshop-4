import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import axios from "axios";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPrvKey, exportPubKey, importPrvKey, importSymKey, rsaDecrypt, symDecrypt } from "../crypto";

let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;

let privateKeyBase64: string;
let publicKeyBase64: string;

async function initializeKeys(nodeId: number) {
  const { publicKey, privateKey } = await generateRsaKeyPair();
  
  privateKeyBase64 = await exportPrvKey(privateKey);
  publicKeyBase64 = await exportPubKey(publicKey);

  console.log(`🔑 Keys initialized for node ${nodeId}`);

  // Enregistrement du nœud au registre
  await axios.post(`http://localhost:${REGISTRY_PORT}/registerNode`, {
    nodeId,
    pubKey: publicKeyBase64
  }).catch(err => console.error("❌ Error registering node:", err));
}

export async function simpleOnionRouter(nodeId: number) {
  await initializeKeys(nodeId);

  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  // Routes GET
  onionRouter.get("/status", (req: Request, res: Response) => res.send("live"));

  onionRouter.get("/getLastReceivedEncryptedMessage", (req: Request, res: Response) => {
    return res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req: Request, res: Response) => {
    return res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req: Request, res: Response) => {
    return res.json({ result: lastMessageDestination });
  });

  // Route pour recevoir et transmettre les messages
  onionRouter.post("/message", async (req: Request, res: Response) => {
    try {
      const { message }: { message: string } = req.body;
      lastReceivedEncryptedMessage = message;

      console.log(`📥 Node ${nodeId} received message: ${message.slice(0, 50)}...`);

      // Extraction des parties du message
      const encryptedSymKey = message.substring(0, 344);
      const encryptedData = message.substring(344);

      // Déchiffrement de la clé symétrique
      const privateKey = await importPrvKey(privateKeyBase64);
      const symKeyBase64 = await rsaDecrypt(encryptedSymKey, privateKey);
      const symKey = await importSymKey(symKeyBase64);

      // Déchiffrement du message
      const decryptedMessage = await symDecrypt(symKeyBase64, encryptedData);
      lastReceivedDecryptedMessage = decryptedMessage;

      console.log(`🔓 Node ${nodeId} decrypted message: ${decryptedMessage}`);

      // Identifier la destination et transférer le message
      const destination = parseInt(decryptedMessage.slice(-10), 10);
      lastMessageDestination = destination;

      await axios.post(`http://localhost:${destination}/message`, {
        message: decryptedMessage.slice(0, -10),
      });

      res.status(200).json({ message: "Message forwarded successfully" });
    } catch (error) {
      console.error("❌ Error forwarding message:", error);
      res.status(500).json({ error: "Failed to forward message" });
    }
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(`🚀 Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
  });

  return server;
}
