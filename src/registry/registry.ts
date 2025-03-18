import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };

export type GetNodeRegistryBody = {
  nodes: { nodeId: number; pubKey: string }[];
};


const nodes: Node[] = [];

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  // Route /status
  _registry.get("/status", (req, res) => {
    res.send("live");
  });

  // Route /registerNode
  const nodes: Node[] = [];

_registry.post("/registerNode", (req: Request, res: Response) => {
  const { nodeId, pubKey } = req.body;

  if (!nodeId || !pubKey) {
    return res.status(400).send({ error: "Invalid node data" });
  }

  nodes.push({ nodeId, pubKey });
  return res.status(200).send({ message: "Node registered successfully" });
}); 

  // Route /getNodeRegistry
  _registry.get("/getNodeRegistry", (req: Request, res: Response) => {
    return res.status(200).json({ nodes });
  });  

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}
