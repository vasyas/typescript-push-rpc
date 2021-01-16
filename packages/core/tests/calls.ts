import {assert} from "chai"
import {createTestClient, startTestServer} from "./testUtils"

describe("calls", () => {
  it("success", async () => {
    const resp = {r: "asf"}

    const invocation = {
      req: null,
      ctx: null,
    }

    await startTestServer({
      test: {
        async getSomething(req, ctx) {
          invocation.req = req
          invocation.ctx = ctx
          return resp
        },
      },
    })

    const client = await createTestClient()

    const req = {key: "value"}
    const r = await client.test.getSomething(req)

    assert.deepEqual(invocation.req, req)
    assert.deepEqual(r, resp)
  })

  it("error", async () => {
    const message = "bla"

    await startTestServer({
      test: {
        async getSomething() {
          throw new Error(message)
        },
      },
    })

    const client = await createTestClient()

    try {
      await client.test.getSomething()
      assert.fail()
    } catch (e) {
      console.log(e)
      assert.equal(e.message, message)
    }
  })

  it("timeout", async () => {
    const callTimeout = 2 * 1000

    await startTestServer({
      test: {
        async longOp() {
          await new Promise(r => setTimeout(r, 2 * callTimeout))
        },
      },
    })

    const client = await createTestClient(1, {
      callTimeout,
    })

    try {
      await client.test.longOp()
      assert.fail()
    } catch (e) {
      assert.equal(e.message.toLowerCase(), "timeout")
    }
  }).timeout(5000)

  it("binds this object", async () => {
    const resp = {r: "asf"}

    await startTestServer({
      test: {
        async getSomething() {
          return this.method()
        },

        async method() {
          return resp
        },
      },
    })

    const client = await createTestClient()

    const r = await client.test.getSomething()
    assert.deepEqual(r, resp)
  })

  it("binds this class", async () => {
    const resp = {r: "asf"}

    class B extends A {
      async method() {
        return resp
      }
    }

    await startTestServer({
      test: new B(),
    })

    const client = await createTestClient()

    const r = await client.test.getSomething()
    assert.deepEqual(r, resp)
  })
})

abstract class A {
  async getSomething() {
    return this.method()
  }

  abstract async method()
}
