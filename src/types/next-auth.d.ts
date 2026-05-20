import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    role?: "user" | "admin"
    active?: boolean
  }

  interface Session {
    user: {
      id: string
      name: string
      email: string
      image?: string | null
      role: "user" | "admin"
      active: boolean
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "user" | "admin"
  }
}
