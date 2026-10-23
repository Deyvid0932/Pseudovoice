package com.pseudovoice.auth.repository;

import com.pseudovoice.auth.entity.ActiveSessionState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ActiveSessionStateRepository extends JpaRepository<ActiveSessionState, Integer> {
    Optional<ActiveSessionState> findByUserId(Integer userId);
}
