import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import axios from "axios";
import { BASE_USER_PORT, REGISTRY_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, rsaEncrypt, symEncrypt } from "../crypto";

let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;
let lastCircuit: number[] | null = null;

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

type NodeRegistryResponse = {
  nodes: { nodeId: number; pubKey: string }[];
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  // Routes GET
  _user.get("/status", (req: Request, res: Response) => res.send("live"));

  _user.get("/getLastReceivedMessage", (req: Request, res: Response) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req: Request, res: Response) => {
    res.json({ result: lastSentMessage });
  });

  _user.get("/getLastCircuit", (req: Request, res: Response) => {
    res.json({ result: lastCircuit });
  });

  // Route /message
  _user.post("/message", (req: Request, res: Response) => {
    const { message }: SendMessageBody = req.body;

    if (message) {
      lastReceivedMessage = message;
      console.log(`📩 User ${userId} received message: ${message}`);
      res.status(200).send("success");
    } else {
      res.status(400).send({ error: "Message is required" });
    }
  });

  // Route /sendMessage
  _user.post("/sendMessage", async (req: Request, res: Response) => {
    try {
      const { message, destinationUserId }: SendMessageBody = req.body;

      const registryResponse = await axios.get<NodeRegistryResponse>(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const nodes = registryResponse.data.nodes;

      if (nodes.length < 3) {
        return res.status(500).send({ error: "Not enough nodes in the registry" });
      }

      // Sélectionner 3 nœuds distincts aléatoires
      const selectedNodes = nodes.sort(() => Math.random() - 0.5).slice(0, 3);
      lastCircuit = selectedNodes.map(n => n.nodeId);

      // Générer des clés symétriques pour chaque nœud
      const symmetricKeys = await Promise.all(selectedNodes.map(() => createRandomSymmetricKey()));

      // Appliquer les couches de chiffrement
      let encryptedMessage = message;

      for (let i = 0; i < selectedNodes.length; i++) {
        const node = selectedNodes[i];
        const symKey = symmetricKeys[i];

        const symKeyBase64 = await exportSymKey(symKey);
        const encryptedData = await symEncrypt(symKey, encryptedMessage);
        const encryptedSymKey = await rsaEncrypt(symKeyBase64, node.pubKey);

        const destination = String(BASE_USER_PORT + destinationUserId).padStart(10, "0");
        encryptedMessage = encryptedSymKey + encryptedData + destination;
      }

      try {
        await axios.post(`http://localhost:${selectedNodes[0].nodeId}/message`, { message: encryptedMessage });
        
        lastSentMessage = message;
        return res.status(200).json({ message: "Message sent successfully" });
    
      } catch (error) {
        console.error("❌ Error sending to first node:", error);
    
        // Vérifie si la réponse HTTP a déjà été envoyée avant d'en renvoyer une autre
        if (!res.headersSent) {
          return res.status(500).json({ error: "Failed to send message to first node" });
        }
      }
    

      lastSentMessage = message;
      return res.status(200).send({ message: "Message sent successfully" });

    } catch (error) {
      console.error("❌ Error sending message:", error);
      return res.status(500).send({ error: "Failed to send message" }); // Ajout du return ici !
    }
  });


  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(`👤 User ${userId} is listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}
