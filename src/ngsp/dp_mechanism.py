# Gaussian differential-privacy mechanism with per-session Rényi DP accountant.
from __future__ import annotations

import math
from typing import Any


# Raised when the session ε budget is exhausted; callers must refuse the request.
class BudgetExhaustedError(RuntimeError):
    pass


# Clip a tensor to L2-norm C, preserving direction; no-op if norm is already ≤ C.
def clip_to_norm(x: Any, C: float) -> Any:
    import torch

    norm = x.norm(p=2)
    if norm > C:
        return x * (C / norm)
    return x


# Add zero-mean Gaussian noise with std σ to a tensor; returns a new tensor on the same device.
def add_gaussian_noise(x: Any, sigma: float, seed: int | None = None) -> Any:
    import torch

    rng = torch.Generator(device=x.device)
    if seed is not None:
        rng.manual_seed(seed)
    noise = torch.randn(x.shape, dtype=x.dtype, device=x.device, generator=rng)
    return x + sigma * noise


# Compute the Gaussian-mechanism σ achieving (ε, δ)-DP with L2 sensitivity Δ.
# Formula: σ = Δ · √(2 · ln(1.25 / δ)) / ε  (Dwork et al., 2014).
def compute_sigma(epsilon: float, delta: float, sensitivity: float = 1.0) -> float:
    if epsilon <= 0 or delta <= 0 or delta >= 1:
        raise ValueError(f"Expected ε>0 and 0<δ<1; got ε={epsilon}, δ={delta}")
    return sensitivity * math.sqrt(2 * math.log(1.25 / delta)) / epsilon


# Convert Gaussian-mechanism Rényi divergence at order α to an (ε, δ)-DP guarantee.
# Formula: ε(α) = α·Δ²/(2σ²)  then  ε_{(ε,δ)} = ε(α) + log(1/δ)/(α-1).
def _rdp_gaussian(alpha: float, sigma: float, sensitivity: float = 1.0) -> float:
    return alpha * (sensitivity**2) / (2 * sigma**2)


# Find the tightest (ε, δ)-bound from a list of Rényi orders by minimizing over α.
def _rdp_to_dp(rdp_values: list[tuple[float, float]], delta: float) -> float:
    best = math.inf
    for alpha, rdp_eps in rdp_values:
        if alpha <= 1:
            continue
        dp_eps = rdp_eps + math.log(1.0 / delta) / (alpha - 1)
        best = min(best, dp_eps)
    return best


class RDPAccountant:
    # Session-scoped Rényi DP accountant; ε is monotone and can only increase.
    # Thread safety: callers are responsible — single-threaded use is assumed.

    # Default set of Rényi orders to evaluate; covers the region relevant to ε ∈ [0.1, 50].
    _DEFAULT_ORDERS: tuple[float, ...] = tuple(
        [1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0, 14.0, 16.0, 32.0, 64.0]
    )

    # Initialize an empty accountant with all Rényi accumulators at zero.
    def __init__(self, orders: tuple[float, ...] | None = None) -> None:
        self._orders = orders or self._DEFAULT_ORDERS
        self._accumulated: dict[float, float] = {a: 0.0 for a in self._orders}

    # Record one mechanism application with the given σ and L2 sensitivity.
    def step(self, sigma: float, sensitivity: float = 1.0) -> None:
        for alpha in self._orders:
            self._accumulated[alpha] += _rdp_gaussian(alpha, sigma, sensitivity)

    # Return the tightest ε such that the accumulated history is (ε, δ)-DP.
    # Returns 0.0 if no mechanism has been applied yet.
    def get_epsilon(self, delta: float) -> float:
        if all(v == 0.0 for v in self._accumulated.values()):
            return 0.0
        rdp_pairs = [(a, v) for a, v in self._accumulated.items()]
        return _rdp_to_dp(rdp_pairs, delta)

    # Reset all accumulators to zero; call only between sessions, never mid-session.
    def reset(self) -> None:
        self._accumulated = {a: 0.0 for a in self._orders}
