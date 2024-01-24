import {safeStringify} from "../utils/json.js"

export class RemoteSubscriptions {
  subscribe(
    initialData: unknown,
    itemName: string,
    parameters: unknown[],
    consumer: (d: unknown) => void
  ) {
    this.addSubscription(itemName, parameters, consumer)

    this.consume(itemName, parameters, initialData)
  }

  unsubscribe(itemName: string, parameters: unknown[], consumer: (d: unknown) => void): boolean {
    const parametersKey = getParametersKey(parameters)

    return this.removeSubscription(itemName, parametersKey, consumer)
  }

  private addSubscription(itemName: string, parameters: unknown[], consumer: (d: unknown) => void) {
    const itemSubscriptions = this.byItem.get(itemName) || {byParameters: new Map()}
    this.byItem.set(itemName, itemSubscriptions)

    const parametersKey = getParametersKey(parameters)
    const parameterSubscriptions = itemSubscriptions.byParameters.get(parametersKey) || {
      parameters,
      cached: null,
      consumers: [],
    }
    itemSubscriptions.byParameters.set(parametersKey, parameterSubscriptions)
    parameterSubscriptions.consumers.push(consumer)
  }

  private removeSubscription(
    itemName: string,
    parametersKey: string,
    consumer: (d: unknown) => void
  ): boolean {
    const itemSubscriptions = this.byItem.get(itemName)
    if (!itemSubscriptions) return false

    const filterSubscriptions = itemSubscriptions.byParameters.get(parametersKey)
    if (!filterSubscriptions) return false

    const index = filterSubscriptions.consumers.indexOf(consumer)
    if (index == -1) return false

    filterSubscriptions.consumers.splice(index, 1)

    if (!filterSubscriptions.consumers.length) {
      itemSubscriptions.byParameters.delete(parametersKey)

      if (itemSubscriptions.byParameters.size == 0) {
        this.byItem.delete(itemName)
      }

      return true
    }

    return false
  }

  getCached(itemName: string, parameters: unknown[]): unknown | undefined {
    const parametersKey = getParametersKey(parameters)

    const itemSubscriptions = this.byItem.get(itemName)
    if (!itemSubscriptions) return

    const filterSubscriptions = itemSubscriptions.byParameters.get(parametersKey)

    return filterSubscriptions?.cached
  }

  consume(itemName: string, parameters: unknown[], data: unknown) {
    const parametersKey = getParametersKey(parameters)

    const itemSubscriptions = this.byItem.get(itemName)
    if (!itemSubscriptions) return

    const filterSubscriptions = itemSubscriptions.byParameters.get(parametersKey)

    if (!filterSubscriptions) return

    filterSubscriptions.cached = data
    filterSubscriptions.consumers.forEach((consumer) => {
      consumer(data)
    })
  }

  getAllSubscriptions(): Array<
    [itemName: string, parameters: unknown[], consumers: Array<(d: unknown) => void>]
  > {
    const result: Array<[string, unknown[], Array<(d: unknown) => void>]> = []

    for (const [itemName, itemSubscriptions] of this.byItem) {
      for (const [, parameterSubscriptions] of itemSubscriptions.byParameters) {
        result.push([itemName, parameterSubscriptions.parameters, parameterSubscriptions.consumers])
      }
    }

    return result
  }

  private byItem: Map<string, ItemSubscription> = new Map()
}

type ItemSubscription = {
  byParameters: Map<
    string,
    {
      parameters: unknown[]
      cached: unknown
      consumers: Array<(d: unknown) => void>
    }
  >
}

function getParametersKey(parameters: unknown[]) {
  return safeStringify(parameters)
}