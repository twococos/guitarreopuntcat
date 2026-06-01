// Diccionari ca — composició del diccionari complet

import { common } from "./common"
import { public_ } from "./public"
import { app } from "./app"
import { editor } from "./editor"
import { admin } from "./admin"
import { metadata } from "./metadata"

export const ca = {
  common,
  public: public_,
  app,
  editor,
  admin,
  metadata,
} as const
