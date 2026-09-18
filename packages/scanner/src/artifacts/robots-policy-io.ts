import * as fs from 'node:fs';
import path from 'node:path';
import type { RobotsPolicyChain } from '../robots-policy-snapshot.js';

const ROBOTS_POLICY_CHAIN_FILENAME = 'robots-policy-chain.json';

export function writeRobotsPolicyChain(auditDir: string, chain: RobotsPolicyChain): void {
  const evidenceDir = path.join(auditDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const filePath = path.join(evidenceDir, ROBOTS_POLICY_CHAIN_FILENAME);
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(chain, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}
