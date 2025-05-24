terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.2"
    }
  }
}

provider "docker" {}

variable "image_tag" {
  description = "Tag for the Docker image"
  type        = string
}

resource "docker_image" "app" {
  name = "xraiinbowcoder/devops:${var.image_tag}"

  build {
    context    = "../"
    dockerfile = "../Dockerfile"
  }
}

resource "docker_container" "app" {
  name  = "devops-app"
  image = docker_image.app.name

  ports {
    internal = 3000
    external = 10044
  }

  env = [
    "MY_ENV_VAR=value"
  ]
}

output "docker_image" {
  value = docker_image.app.name
}

output "docker_container" {
  value = docker_container.app.name
}

