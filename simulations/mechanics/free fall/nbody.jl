# gravitational_nbody.jl
# Minimal N-body gravitational simulation in Julia using velocity-Verlet
# Run: julia gravitational_nbody.jl

using Printf
using Random

# --------------------------
# Configuration parameters
# --------------------------
const G = 6.67430e-11           # Gravitational constant (SI) [m^3 kg^-1 s^-2]
const NDIM = 2                  # 2 for planar, 3 for spatial
const SOFTENING = 1e3           # Softening length ε (meters) to avoid singularities
const DT = 1.0                  # Time step (seconds)
const NSTEPS = 10_000           # Number of integration steps
const OUTPUT_EVERY = 100        # Print/record every N steps

# --------------------------
# Types and initialization
# --------------------------
struct Body
    m::Float64
    x::Vector{Float64}  # length NDIM
    v::Vector{Float64}  # length NDIM
end

"Create a random system: N equal masses in a disk (2D) or sphere (3D) with small velocities."
function random_system(N::Int; m=1e10, radius=1.0e6, vscale=1.0)
    rng = Random.default_rng()
    bodies = Body[]
    for i in 1:N
        if NDIM == 2
            θ = 2π*rand(rng)
            r = radius*sqrt(rand(rng))
            x = [r*cos(θ), r*sin(θ)]
            v = vscale * (rand(rng, 2) .- 0.5)
        else
            # 3D: pick a random point in a sphere
            while true
                p = 2.0 .* rand(rng, 3) .- 1.0
                if sum(abs2, p) ≤ 1.0
                    x = radius .* p
                    v = vscale .* (rand(rng, 3) .- 0.5)
                    break
                end
            end
        end
        push!(bodies, Body(m, x, v))
    end
    return bodies
end

"Compute accelerations from Newtonian gravity with Plummer softening."
function accelerations!(a::Vector{Vector{Float64}}, bodies::Vector{Body})
    N = length(bodies)
    # zero
    for i in 1:N
        fill!(a[i], 0.0)
    end
    # pair forces
    ε2 = SOFTENING^2
    for i in 1:N-1
        xi = bodies[i].x; mi = bodies[i].m
        for j in i+1:N
            xj = bodies[j].x; mj = bodies[j].m
            # displacement
            # r_vec = xj - xi
            @inbounds begin
                r2 = 0.0
                rvec = similar(xi)
                for d in 1:NDIM
                    rvec[d] = xj[d] - xi[d]
                    r2 += rvec[d]*rvec[d]
                end
                r2e = r2 + ε2
                invr3 = inv(sqrt(r2e)*r2e)
                fac_i =  G*mj*invr3
                fac_j = -G*mi*invr3
                for d in 1:NDIM
                    a[i][d] += fac_i * rvec[d]
                    a[j][d] += fac_j * rvec[d]
                end
            end
        end
    end
    return a
end

"Compute total energy (kinetic + potential) with softening."
function total_energy(bodies::Vector{Body})
    N = length(bodies)
    # kinetic
    K = 0.0
    for i in 1:N
        vi2 = 0.0
        for d in 1:NDIM
            vi2 += bodies[i].v[d]^2
        end
        K += 0.5*bodies[i].m*vi2
    end
    # potential
    ε2 = SOFTENING^2
    U = 0.0
    for i in 1:N-1
        xi = bodies[i].x; mi = bodies[i].m
        for j in i+1:N
            xj = bodies[j].x; mj = bodies[j].m
            r2 = 0.0
            for d in 1:NDIM
                r2 += (xj[d]-xi[d])^2
            end
            # Plummer softened potential
            U -= G*mi*mj / sqrt(r2 + ε2)
        end
    end
    return K + U
end

"One velocity-Verlet step: x_{n+1} = x_n + v_n*dt + 0.5*a_n*dt^2; v_{n+1} = v_n + 0.5*(a_n+a_{n+1})*dt."
function vv_step!(bodies::Vector{Body}, a::Vector{Vector{Float64}}, dt::Float64)
    N = length(bodies)
    # x half-update with current acceleration
    for i in 1:N
        for d in 1:NDIM
            bodies[i].x[d] += bodies[i].v[d]*dt + 0.5*a[i][d]*dt*dt
            bodies[i].v[d] += 0.5*a[i][d]*dt
        end
    end
    # compute new accelerations
    accelerations!(a, bodies)
    # complete velocity update
    for i in 1:N
        for d in 1:NDIM
            bodies[i].v[d] += 0.5*a[i][d]*dt
        end
    end
end

"Run simulation; returns trajectory samples and energies at output cadence."
function simulate!(bodies::Vector{Body}; dt=DT, nsteps=NSTEPS, output_every=OUTPUT_EVERY)
    N = length(bodies)
    a = [zeros(Float64, NDIM) for _ in 1:N]
    accelerations!(a, bodies)

    samples = Vector{Vector{Float64}}()
    energies = Float64[]
    times = Float64[]

    # record initial
    push!(times, 0.0)
    push!(energies, total_energy(bodies))
    push!(samples, reduce(vcat, (reduce(vcat, b.x) for b in bodies)))

    t = 0.0
    for k in 1:nsteps
        vv_step!(bodies, a, dt)
        t += dt
        if k % output_every == 0
            push!(times, t)
            push!(energies, total_energy(bodies))
            push!(samples, reduce(vcat, (reduce(vcat, b.x) for b in bodies)))
            @printf("step=%d t=%.3f E=%.6e\n", k, t, energies[end])
        end
    end
    return times, energies, samples
end

# --------------------------
# Example setups
# --------------------------
"Two-body circular-ish orbit setup for NDIM=2."
function two_body_demo()
    # Earth-mass and smaller mass in near-circular orbit
    m1 = 5.972e24
    m2 = 7.348e22
    r = 4.0e7         # separation (m)
    v = sqrt(G*(m1+m2)/r)  # circular relative speed
    # Place along x-axis, velocities along y for counterclockwise orbit
    x1 = [-m2/(m1+m2)*r, 0.0]
    x2 = [ m1/(m1+m2)*r, 0.0]
    v1 = [0.0, -m2/(m1+m2)*v]
    v2 = [0.0,  m1/(m1+m2)*v]
    bodies = Body[
        Body(m1, copy(x1), copy(v1)),
        Body(m2, copy(x2), copy(v2))
    ]
    return bodies
end

# --------------------------
# Main
# --------------------------
function main()
    # Choose one:
    # bodies = random_system(50; m=1e10, radius=1e7, vscale=0.0)
    bodies = two_body_demo()

    times, energies, samples = simulate!(bodies)

    # Write simple CSV outputs
    open("energies.csv", "w") do io
        println(io, "t,E")
        for (t, E) in zip(times, energies)
            @printf(io, "%.6f,%.10e\n", t, E)
        end
    end
    # samples rows correspond to output checkpoints; columns are concatenated positions
    # For NDIM=2 and N bodies, columns: x1,y1,x2,y2,...,xN,yN
    open("positions.csv", "w") do io
        N = length(bodies)
        # header
        hdr = String[]
        for i in 1:N
            for d in 1:NDIM
                push!(hdr, "x$(i)_$(d)")
            end
        end
        println(io, "t," * join(hdr, ","))
        for (k, t) in enumerate(times)
            pos = samples[k]
            @printf(io, "%.6f", t)
            for v in pos
                @printf(io, ",%.10e", v)
            end
            println(io)
        end
    end
    println("Wrote energies.csv and positions.csv")
end

main()
