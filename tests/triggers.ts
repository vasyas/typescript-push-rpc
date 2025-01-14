import {createTestClient, startTestServer} from "./testUtils.js"
import {adelay} from "../src/utils/promises.js"
import {assert} from "chai"
import {groupReducer} from "../src/utils/throttle.js"

describe("Subscription triggers", () => {
  it("trigger filter", async () => {
    interface Item {
      key: string
      updated: number
    }

    const services = await startTestServer({
      test: {
        async item({key}: {key: string}): Promise<{key: string; updated: number}> {
          return {key, updated: Date.now()}
        },
      },
    })

    services.test.item.throttle({
      timeout: 0,
    })

    const remote = await createTestClient<typeof services>({
      connectOnCreate: true,
    })

    let item1
    let item2

    const sub1 = (item: Item) => (item1 = item)
    const sub2 = (item: Item) => (item2 = item)

    await remote.test.item.subscribe(sub1, {key: "1"})
    await remote.test.item.subscribe(sub2, {key: "2"})

    // first notificaiton right after subscription, clear items
    await adelay(20)

    // trigger sends 1st item, but not second
    item1 = null
    item2 = null

    services.test.item.trigger({key: "1"})
    await adelay(20)
    assert.equal(item1!.key, "1")
    assert.isNull(item2)

    // null trigger sends all items
    item1 = null
    item2 = null

    services.test.item.trigger()
    await adelay(20)
    assert.deepEqual(item1!.key, "1")
    assert.deepEqual(item2!.key, "2")
  })

  it("trigger throttling", async () => {
    const throttleTimeout = 400

    const services = await startTestServer({
      test: {
        item: async () => "result",
      },
    })

    services.test.item.throttle({
      timeout: throttleTimeout,
    })

    const remote = await createTestClient<typeof services>({
      connectOnCreate: true,
    })

    let count = 0
    let item = null

    await remote.test.item.subscribe((i) => {
      count++
      item = i
    })

    await adelay(50)
    assert.equal(count, 1)
    assert.equal(item, "result")

    services.test.item.trigger(undefined, "1st")
    services.test.item.trigger(undefined, "2nd") // throttled
    await adelay(50)
    assert.equal(count, 2)
    assert.equal(item, "1st")

    services.test.item.trigger(undefined, "3rd") // throttled
    services.test.item.trigger(undefined, "4th") // delivered on trailing edge

    await adelay(50)
    assert.equal(count, 2)

    await adelay(throttleTimeout + 50)
    assert.equal(count, 3)
    assert.equal(item, "4th")
  })

  it("throttling reducer", async () => {
    const throttleTimeout = 400

    const services = await startTestServer({
      test: {
        item: async () => [] as number[],
      },
    })

    services.test.item.throttle({
      timeout: throttleTimeout,
      reducer: groupReducer,
    })

    const remote = await createTestClient<typeof services>()

    let item = null

    await remote.test.item.subscribe((i) => {
      console.log(i)
      item = i
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    await adelay(50)
    assert.deepEqual(item, [])

    services.test.item.trigger(undefined, [1])
    services.test.item.trigger(undefined, [2]) // throttled
    services.test.item.trigger(undefined, [3]) // throttled
    await adelay(50)
    assert.deepEqual(item, [1])

    await new Promise((resolve) => setTimeout(resolve, throttleTimeout))
    assert.deepEqual(item, [2, 3]) // trailing edge
  })
})
