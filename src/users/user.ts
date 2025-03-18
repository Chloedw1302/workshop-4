import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import axios from "axios";
import { BASE_USER_PORT, REGISTRY_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, rsaEncrypt, symEncrypt } from "../crypto";

let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

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

  // Route /status
  _user.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });

  // Route /getLastReceivedMessage
  _user.get("/getLastReceivedMessage", (req: Request, res: Response) => {
    res.json({ result: lastReceivedMessage });
  });

  // Route /getLastSentMessage
  _user.get("/getLastSentMessage", (req: Request, res: Response) => {
    res.json({ result: lastSentMessage });
  });

  // Route /message
  _user.post("/message", (req: Request, res: Response) => {
    const { message }: SendMessageBody = req.body;

    if (message) {
      lastReceivedMessage = message;
      console.log(`User ${userId} received message: ${message}`);
      res.status(200).send({ message: "Message received successfully" });
    } else {
      res.status(400).send({ error: "Message is required" });
    }
  });

  // Route /sendMessage
  _user.post("/sendMessage", async (req: Request, res: Response) => {
    try {
      const { message, destinationUserId }: SendMessageBody = req.body;
  
      // Obtenir le registre des nœuds
      const registryResponse = await axios.get<NodeRegistryResponse>(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const nodes = registryResponse.data.nodes;
  
      if (nodes.length < 3) {
        // Envoyer une réponse en cas d'erreur
        return res.status(500).send({ error: "Not enough nodes in the registry" });
      }
  
      // Sélectionner 3 nœuds distincts aléatoires
      const selectedNodes = nodes.sort(() => Math.random() - 0.5).slice(0, 3);
  
      // Générer des clés symétriques pour chaque nœud
      const symmetricKeys = await Promise.all(selectedNodes.map(() => createRandomSymmetricKey()));
  
      // Appliquer les couches de chiffrement
      let encryptedMessage = message;
  
      for (let i = 0; i < selectedNodes.length; i++) {
        const node = selectedNodes[i];
        const symKey = symmetricKeys[i];
  
        // Exporter la clé symétrique
        const symKeyBase64 = await exportSymKey(symKey);
  
        // Chiffrer le message avec la clé symétrique
        const encryptedData = await symEncrypt(symKey, encryptedMessage);
  
        // Chiffrer la clé symétrique avec la clé publique du nœud
        const encryptedSymKey = await rsaEncrypt(symKeyBase64, node.pubKey);
  
        // Ajouter la destination et concaténer le tout
        const destination = String(BASE_USER_PORT + destinationUserId).padStart(10, "0");
        encryptedMessage = encryptedSymKey + encryptedData + destination;

      }
  
      // Envoyer le message au premier nœud
      await axios.post(`http://localhost:${selectedNodes[0].nodeId}/message`, { message: encryptedMessage });
  
      // Mettre à jour le dernier message envoyé
      lastSentMessage = message;
  
      // Envoyer la réponse de succès
      return res.status(200).send({ message: "Message sent successfully" });
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Envoyer la réponse en cas d'erreur
      return res.status(500).send({ error: "Failed to send message" });
    }
  });
  

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} is listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}
