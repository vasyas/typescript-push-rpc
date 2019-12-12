import {createRpcClient, setLogger} from "@push-rpc/core"
import {createWebsocket} from "@push-rpc/websocket"
import {Services} from "./shared"

setLogger(console)
;(async () => {
  const services: Services = (
    await createRpcClient(1, () => createWebsocket("ws://localhost:5555"))
  ).remote

  console.log("Client connected")

  services.todo.todos.subscribe(todos => {
    console.log("Got todo items", todos)
  })

  await services.todo.addTodo({text: "Buy groceries"})
})()
