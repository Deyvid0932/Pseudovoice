package com.pseudovoice.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PseudovoiceAuthApplication {

	public static void main(String[] args) {
		SpringApplication.run(PseudovoiceAuthApplication.class, args);
	}

}
