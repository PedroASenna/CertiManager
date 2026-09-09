package com.certimanager.servidor.auth;

/** Identidade extraida de um token JWT valido. */
public record Sessao(long id, String email, int role) {
}
