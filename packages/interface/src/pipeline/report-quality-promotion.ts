import type { Connection } from 'mongoose';
import type { Sha256Digest } from '@odysseus/core';
import { approveExactReportBundle, atomicallyActivateReportBundle, getReportBundleByDigest, markReportQualityRunFromOperator } from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { promoteContentAddressedPdf } from './report-quality-storage.js';
export async function approveAndPromoteReportQualityBundle(connection:Connection,artifactStore:ArtifactStore|undefined,input:{auditId:string;qualityRunId:string;epoch:number;bundleDigest:Sha256Digest}){
 if(!artifactStore)throw new Error('Promotion requires configured artifact store');
 const current=await getReportBundleByDigest(connection,input.auditId,input.bundleDigest);
 if(!current||current.qualityRunId!==input.qualityRunId||current.epoch!==input.epoch)throw new Error('Exact quality run/epoch/bundle digest is not current');
 if(current.evidenceApprovalMode==='legacy-adapter')throw new Error('Production promotion is blocked until Plan 059 supplies canonical ApprovedAuditEvidence');
 if(current.state==='promoted')throw new Error('Bundle already promoted');
 const approved=current.state==='awaiting-operator-approval'?await approveExactReportBundle(connection,input):current.state==='operator-approved'?current:(()=>{throw new Error(`Bundle is not approvable from ${current.state}`)})();
 await markReportQualityRunFromOperator(connection,{...input,state:'operator-approved'});
 const [frObjectKey,enObjectKey]=await Promise.all([promoteContentAddressedPdf(artifactStore,approved.fr.privateObjectKey,approved.fr.pdfDigest),promoteContentAddressedPdf(artifactStore,approved.en.privateObjectKey,approved.en.pdfDigest)]);
 const active=await atomicallyActivateReportBundle(connection,{auditId:input.auditId,bundle:approved,frObjectKey,enObjectKey});
 await markReportQualityRunFromOperator(connection,{...input,state:'promoted'});
 return{bundleDigest:active.bundleDigest,revision:active.revision};
}
