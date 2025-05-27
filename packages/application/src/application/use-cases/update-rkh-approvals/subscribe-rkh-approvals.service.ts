import { ICommandBus, Logger } from '@filecoin-plus/core'
import { Container } from 'inversify'

import { ILotusClient } from '@src/infrastructure/clients/lotus'
import { TYPES } from '@src/types'
import { methods as m } from 'filecoin-verifier-tools'
import config from '@src/config'
import { UpdateRKHApprovalsCommand } from './update-rkh-approvals.command'
import { IApplicationDetailsRepository } from '@src/infrastructure/respositories/application-details.repository'
import * as address from '@glif/filecoin-address'
import cbor from "cbor";

const RKH_MULTISIG_ACTOR_ADDRESS = 'f080'

const VERIFIED_REGISTRY_ACTOR_METHODS = {
  ADD_VERIFIER: 2,
}

const getVerifierFromParams = (params: string, logger: Logger): string => {
  const paramsBytes = Uint8Array.from(Buffer.from(params, 'base64'));
  const paramsCbor = cbor.decode(paramsBytes)

  // TODO we should decode this through the methods.decode() function but
  // at time of writing it doesn't cope with F4s so unroll it by hand
  // Should be 2 buffers, first is the address, second is the datacap. If any of that
  // fails we can quietly ignore it
  if (!Array.isArray(paramsCbor) || paramsCbor.length !== 2) {
    logger.debug("Ignoring malformed addVerifier message")
    return ""
  }

  const addr = new address.Address(paramsCbor[0])
  const verifier = address.encode('f', addr)

  return verifier
}

async function findProcessApprovals(
  lotusClient: ILotusClient,
  commandBus: ICommandBus,
  applicationDetailsRepository: IApplicationDetailsRepository,
  methods: any,
  logger: Logger) {
  
  const msigState = await lotusClient.getMultisig(RKH_MULTISIG_ACTOR_ADDRESS)
  logger.debug(`msigState is: ${JSON.stringify(msigState)}`)

  // First do pending ones, to update the m-of-n state
  logger.debug(`Found ${msigState.pendingTxs.length} pending transactions`)
  for (const tx of msigState.pendingTxs) {
    logger.debug(`Processing pending transaction: ${JSON.stringify(tx)}`)

    if (tx.to != config.VERIFIED_REGISTRY_ACTOR_ADDRESS || tx.method != VERIFIED_REGISTRY_ACTOR_METHODS.ADD_VERIFIER) {
      logger.debug("Skipping irrelevant RKH multisig proposal", tx)
    }

    // Parse the params from the pending tx and extract the verifier address
    let verifier = getVerifierFromParams(tx.params, logger)

    const applicationDetails = await applicationDetailsRepository.getByAddress(verifier)
    if (!applicationDetails) {
      console.log('Application details not found for address', verifier)
      continue
    }
    try {
      await commandBus.send(new UpdateRKHApprovalsCommand(applicationDetails.id, tx.id, tx.approved, "Pending"))
    } catch (error) {
      console.error('Error updating RKH outstanding approvals', { error })
    }
  }

  // Now do recently completed ones
  logger.debug(`Found ${msigState.approvedTxs.length} approved transactions`)
  for (const tx of msigState.approvedTxs) {
    try {
      const verifier = getVerifierFromParams(tx.params, logger)

      const applicationDetails = await applicationDetailsRepository.getByAddress(verifier)
      if (!applicationDetails) {
        console.log('Application details not found for address', verifier)
        continue
      }

      await commandBus.send(new UpdateRKHApprovalsCommand(applicationDetails.id, 0, [], "Approved"))
    } catch (error) {
      console.error('Error updating RKH completed approvals', { error })
      // swallow and move on to the next one, it's probably just not for us
    }
  }
}

export async function subscribeRKHApprovals(container: Container) {
  const methods = (await m()).mainnet

  const commandBus = container.get<ICommandBus>(TYPES.CommandBus)
  const logger = container.get<Logger>(TYPES.Logger)
  const applicationDetailsRepository = container.get<IApplicationDetailsRepository>(TYPES.ApplicationDetailsRepository)
  const lotusClient = container.get<ILotusClient>(TYPES.LotusClient)

  logger.info('Subscribing to RKH proposals')
  setInterval(async () => {
    try{
      await findProcessApprovals(lotusClient, commandBus, applicationDetailsRepository, methods, logger)
    }catch (err) {
      console.error("RKH subscription failed:", err);
      // swallow error and wait for next tick
    }
  }, config.SUBSCRIBE_RKH_APPROVALS_POLLING_INTERVAL)
}
