{
  "bindings": [
    { "authLevel": "anonymous", "type": "httpTrigger", "direction": "in", "name": "req", "methods": [ "get" ], "route": "session/{code}" },
    { "type": "http", "direction": "out", "name": "res" }
  ]
}
