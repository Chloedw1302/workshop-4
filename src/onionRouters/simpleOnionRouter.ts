import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import axios from "axios";
import { BASE_ONION_ROUTER_PORT } from "../config";
import { generateRsaKeyPair, exportPrvKey, exportPubKey, importPrvKey, importSymKey, rsaDecrypt, symDecrypt } from "../crypto";

let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;

let privateKeyBase64: string;
let publicKeyBase64: string;

async function initializeKeys() {
  const { publicKey, privateKey } = await generateRsaKeyPair();
  
  // Exportation des clés en base64
  privateKeyBase64 = await exportPrvKey(privateKey);
  publicKeyBase64 = await exportPubKey(publicKey);

  console.log("Keys initialized for node");
}

export async function simpleOnionRouter(nodeId: number) {
  await initializeKeys();

  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  // Route /status
  onionRouter.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });
  onionRouter.get("/getLastReceivedEncryptedMessage", (req: Request, res: Response) => {
    return res.json({ result: lastReceivedEncryptedMessage });
  });
  
  onionRouter.get("/getLastReceivedDecryptedMessage", (req: Request, res: Response) => {
    return res.json({ result: lastReceivedDecryptedMessage });
  });
  
  onionRouter.get("/getLastMessageDestination", (req: Request, res: Response) => {
    return res.json({ result: lastMessageDestination });
  });
  
  //onionRouter.get("/getLastCircuit", (req: Request, res: Response) => {
  //  return res.json({ result: circuit });  // Assurez-vous que `circuit` est défini
  //});
  

  // Route /message
  onionRouter.post("/message", async (req: Request, res: Response) => {
    try {
      const { message }: { message: string } = req.body;
  
      lastReceivedEncryptedMessage = message;
  
      // Extraire les parties du message
      const encryptedSymKey = message.substring(0, 344);
      const encryptedData = message.substring(344);
  
      // Importer la clé privée et déchiffrer la clé symétrique
      const privateKey = await importPrvKey(privateKeyBase64);
      const decryptedSymKeyBase64 = await rsaDecrypt(encryptedSymKey, privateKey);

  
      // Importer la clé symétrique et déchiffrer le message
      const symKey = await importSymKey(decryptedSymKeyBase64);
      const decryptedMessage = await symDecrypt(decryptedSymKeyBase64, encryptedData);

  
      lastReceivedDecryptedMessage = decryptedMessage;
  
      // Identifier la destination et transférer le message
      const destination = parseInt(decryptedMessage.slice(-10), 10);
      lastMessageDestination = destination;
  
      await axios.post(`http://localhost:${destination}/message`, {
        message: decryptedMessage.slice(0, -10),
      });
  
      res.status(200).send({ message: "Message forwarded successfully" });
    } catch (error) {
      console.error("Error forwarding message:", error);
      res.status(500).send({ error: "Failed to forward message" });
    }
  });
  
  

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(`Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
  });

  return server;
}


