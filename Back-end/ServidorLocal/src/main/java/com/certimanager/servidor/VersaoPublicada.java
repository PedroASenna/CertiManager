package com.certimanager.servidor;

import java.nio.file.Path;

/** Uma versao do AgenteTerminal publicada na pasta de releases do ServidorLocal. */
public record VersaoPublicada(String versao, Path arquivo) {
}
