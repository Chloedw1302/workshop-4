import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";
import crypto from "crypto";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

const nodeRegistry: Node[] = [];
const privateKeys: Record<number, string> = {}; // Stocke temporairement les clés privées pour les tests

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  // Endpoint pour vérifier le statut
  _registry.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });

  // Endpoint pour enregistrer un nœud
  _registry.post("/registerNode", (req: Request, res: Response) => {
    const { nodeId, pubKey } = req.body as RegisterNodeBody;
    
    if (nodeId === undefined || !pubKey) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Vérifie si le nœud est déjà enregistré
    const existingNode = nodeRegistry.find(node => node.nodeId === nodeId);
    
    if (existingNode) {
      existingNode.pubKey = pubKey; // Mise à jour de la clé publique
    } else {
      nodeRegistry.push({ nodeId, pubKey });
    }

    return res.status(200).json({ message: "Node registered successfully" });
  });

  // Endpoint pour récupérer la liste des nœuds enregistrés
  _registry.get("/getNodeRegistry", (req: Request, res: Response) => {
    res.json({ nodes: nodeRegistry });
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}