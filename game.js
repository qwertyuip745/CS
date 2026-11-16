import * as THREE from "three";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89969b);
scene.fog = new THREE.Fog(0x89969b, 24, 58);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = "YXZ";
camera.position.set(0, 1.65, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.querySelector("#game").prepend(renderer.domElement);

const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const startButton = document.querySelector("#start-button");
const enemyCount = document.querySelector("#enemies");
const timerDisplay = document.querySelector("#timer");
const healthValue = document.querySelector("#health-value");
const healthBar = document.querySelector("#health-bar");
const ammoValue = document.querySelector("#ammo-value");
const reserveValue = document.querySelector("#reserve-value");
const notice = document.querySelector("#notice");
const hitMarker = document.querySelector("#hit-marker");

const obstacleSpecs = [
  { x: 0, z: 0, w: 3.2, d: 2.2, h: 1.8 },
  { x: -7, z: -5, w: 4.2, d: 1.5, h: 1.4 },
  { x: 7, z: -5, w: 4.2, d: 1.5, h: 1.4 },
  { x: -7, z: 5, w: 1.6, d: 4, h: 1.7 },
  { x: 7, z: 5, w: 1.6, d: 4, h: 1.7 },
  { x: 0, z: -10, w: 7, d: 1.3, h: 1.5 },
  { x: 0, z: 10, w: 7, d: 1.3, h: 1.5 }
];
const obstacleMeshes = [];
const boundaryMeshes = [];
const bots = [];
const projectiles = [];
const keys = new Set();
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
const projectileGeometry = new THREE.SphereGeometry(0.035, 6, 6);
const projectileMaterials = {
  player: new THREE.MeshBasicMaterial({ color: 0xc9fa58 }),
  enemy: new THREE.MeshBasicMaterial({ color: 0xff765b })
};
const trailMaterials = {
  player: new THREE.LineBasicMaterial({ color: 0xe9ffab, transparent: true, opacity: 0.75 }),
  enemy: new THREE.LineBasicMaterial({ color: 0xff9578, transparent: true, opacity: 0.7 })
};

let state = "menu";
let health = 100;
let ammo = 30;
let reserveAmmo = 90;
let roundTime = 90;
let yaw = 0;
let pitch = 0;
let isFiring = false;
let nextShotAt = 0;
let isReloading = false;
let reloadTimer = 0;
let noticeTimer = 0;
let hitMarkerTimer = 0;

const player = {
  position: new THREE.Vector3(0, 1.65, 12),
  radius: 0.38,
  speed: 5.2
};

scene.add(new THREE.HemisphereLight(0xdce9ed, 0x45535a, 2.15));
const sun = new THREE.DirectionalLight(0xffe6c6, 2.6);
sun.position.set(-9, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(42, 42),
  new THREE.MeshStandardMaterial({ color: 0x626e70, roughness: 0.92 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(40, 40, 0x8b9994, 0x75817e);
grid.position.y = 0.012;
grid.material.transparent = true;
grid.material.opacity = 0.22;
scene.add(grid);

function addBox(x, y, z, width, height, depth, color, castShadow = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

for (const spec of obstacleSpecs) {
  const mesh = addBox(spec.x, spec.h / 2, spec.z, spec.w, spec.h, spec.d, 0x65706b);
  obstacleMeshes.push(mesh);
  addBox(spec.x, spec.h + 0.025, spec.z, spec.w + 0.08, 0.05, spec.d + 0.08, 0xc3ac77, false);
}

boundaryMeshes.push(
  addBox(0, 1.5, -20.5, 42, 3, 1, 0x4d5958),
  addBox(0, 1.5, 20.5, 42, 3, 1, 0x4d5958),
  addBox(-20.5, 1.5, 0, 1, 3, 42, 0x4d5958),
  addBox(20.5, 1.5, 0, 1, 3, 42, 0x4d5958)
);

const weapon = new THREE.Group();
const weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x252c2e, metalness: 0.6, roughness: 0.45 });
const weaponBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.48), weaponMaterial);
weaponBody.position.set(0.31, -0.28, -0.56);
weapon.add(weaponBody);
const weaponBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), weaponMaterial);
weaponBarrel.rotation.x = Math.PI / 2;
weaponBarrel.position.set(0.31, -0.245, -0.9);
weapon.add(weaponBarrel);
camera.add(weapon);
scene.add(camera);

function createBot(x, z, index) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: index % 2 ? 0x9b624c : 0x8a5148, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x343b3c, roughness: 0.68 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.65, 4, 8), uniform);
  body.position.y = 0.83;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), new THREE.MeshStandardMaterial({ color: 0xb98c6b }));
  head.position.y = 1.55;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.68;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.58), dark);
  gun.position.set(0.29, 1.02, -0.24);
  group.add(body, head, helmet, gun);
  group.position.set(x, 0, z);
  group.traverse((part) => {
    if (part.isMesh) part.userData.botIndex = index;
  });
  scene.add(group);
  bots.push({
    group,
    health: 100,
    alive: true,
    shotCooldown: 1.5 + Math.random() * 3,
    strafeDirection: index % 2 ? 1 : -1,
    strafeTimer: 1.5 + index
  });
}

function isBotSpawnAvailable(position, reservedPositions) {
  if (Math.hypot(position.x - player.position.x, position.z - player.position.z) < 8) return false;
  if (obstacleSpecs.some((spec) =>
    Math.abs(position.x - spec.x) < spec.w / 2 + 0.8 &&
    Math.abs(position.z - spec.z) < spec.d / 2 + 0.8
  )) return false;
  return reservedPositions.every((reserved) => reserved.distanceTo(position) >= 2.5);
}

function createRandomSpawnPositions(count) {
  const positions = [];
  for (let attempt = 0; positions.length < count && attempt < 1200; attempt += 1) {
    const candidate = new THREE.Vector3(
      THREE.MathUtils.randFloat(-17.5, 17.5),
      0,
      THREE.MathUtils.randFloat(-17.5, 17.5)
    );
    if (isBotSpawnAvailable(candidate, positions)) positions.push(candidate);
  }

  for (let z = -17; positions.length < count && z <= 17; z += 2.5) {
    for (let x = -17; positions.length < count && x <= 17; x += 2.5) {
      const candidate = new THREE.Vector3(x, 0, z);
      if (isBotSpawnAvailable(candidate, positions)) positions.push(candidate);
    }
  }
  return positions;
}

function createProjectile(origin, direction, owner, damage, speed, gravity) {
  const mesh = new THREE.Mesh(projectileGeometry, projectileMaterials[owner]);
  mesh.position.copy(origin);
  scene.add(mesh);

  const trailGeometry = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(6);
  trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  const trail = new THREE.Line(trailGeometry, trailMaterials[owner]);
  trail.frustumCulled = false;
  scene.add(trail);

  projectiles.push({
    mesh,
    trail,
    velocity: direction.clone().normalize().multiplyScalar(speed),
    owner,
    damage,
    gravity,
    age: 0
  });
}

function setState(nextState) {
  state = nextState;
  document.body.dataset.state = nextState;
  const messages = {
    menu: ["準備進場", "每回合會隨機刷新 5–20 名 BOT，擊敗全部對手即可取勝。", "進入訓練場"],
    paused: ["暫停中", "戰場已暫停。準備好後繼續回合。", "繼續遊戲"],
    won: ["回合勝利", "所有對手已被擊敗，做得好。", "再玩一回合"],
    lost: ["回合結束", "這次沒能守住訓練場，再試一次吧。", "重新開始"]
  };
  if (messages[nextState]) {
    overlayTitle.textContent = messages[nextState][0];
    overlayCopy.textContent = messages[nextState][1];
    startButton.innerHTML = `${messages[nextState][2]} <span>→</span>`;
  }
}

function updateHud() {
  healthValue.textContent = String(Math.ceil(health));
  healthBar.style.width = `${Math.max(0, health)}%`;
  healthBar.style.backgroundColor = health <= 30 ? "#ff655b" : "";
  ammoValue.textContent = isReloading ? "…" : String(ammo).padStart(2, "0");
  reserveValue.textContent = String(reserveAmmo).padStart(2, "0");
  enemyCount.textContent = String(bots.filter((bot) => bot.alive).length).padStart(2, "0");
  const seconds = Math.max(0, Math.ceil(roundTime));
  timerDisplay.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function showNotice(message) {
  notice.textContent = message;
  notice.classList.add("visible");
  noticeTimer = 1.5;
}

function removeProjectile(index) {
  const [projectile] = projectiles.splice(index, 1);
  if (!projectile) return;
  scene.remove(projectile.mesh, projectile.trail);
  projectile.trail.geometry.dispose();
}

function clearProjectiles() {
  while (projectiles.length > 0) removeProjectile(projectiles.length - 1);
}

function removeBots() {
  for (const bot of bots) {
    scene.remove(bot.group);
    bot.group.traverse((part) => {
      if (!part.isMesh) return;
      part.geometry.dispose();
      if (Array.isArray(part.material)) part.material.forEach((material) => material.dispose());
      else part.material.dispose();
    });
  }
  bots.length = 0;
}

function applyProjectileDamageToBot(bot, hit) {
  const isHeadshot = hit.point.y > bot.group.position.y + 1.35;
  bot.health -= isHeadshot ? 50 : 34;
  hitMarker.classList.add("active");
  hitMarkerTimer = 0.12;
  if (bot.health <= 0) {
    bot.alive = false;
    scene.remove(bot.group);
    updateHud();
    if (bots.every((candidate) => !candidate.alive)) endRound(true);
  }
}

function getPlayerHitDistance(start, end) {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared === 0) return null;
  const playerCenter = player.position.clone();
  playerCenter.y -= 0.55;
  const amount = THREE.MathUtils.clamp(playerCenter.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  const closestPoint = start.clone().addScaledVector(segment, amount);
  if (closestPoint.distanceTo(playerCenter) > 0.48) return null;
  return amount * Math.sqrt(lengthSquared);
}

function updateProjectiles(delta) {
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index];
    const start = projectile.mesh.position.clone();
    projectile.velocity.y -= projectile.gravity * delta;
    const end = start.clone().addScaledVector(projectile.velocity, delta);
    const segment = end.clone().sub(start);
    const segmentLength = segment.length();

    if (segmentLength > 0) {
      raycaster.set(start, segment.normalize());
      raycaster.far = segmentLength;
      const targets = projectile.owner === "player"
        ? [floor, ...boundaryMeshes, ...obstacleMeshes, ...bots.filter((bot) => bot.alive).map((bot) => bot.group)]
        : [floor, ...boundaryMeshes, ...obstacleMeshes];
      const hit = raycaster.intersectObjects(targets, true)[0];
      const playerHitDistance = projectile.owner === "enemy" ? getPlayerHitDistance(start, end) : null;

      const trailPositions = projectile.trail.geometry.attributes.position;
      trailPositions.setXYZ(0, start.x, start.y, start.z);
      trailPositions.setXYZ(1, end.x, end.y, end.z);
      trailPositions.needsUpdate = true;

      if (playerHitDistance !== null && (!hit || playerHitDistance <= hit.distance)) {
        removeProjectile(index);
        health = Math.max(0, health - projectile.damage);
        updateHud();
        if (health <= 0) {
          endRound(false);
          return;
        }
        continue;
      }

      if (hit) {
        const botIndex = hit.object.userData.botIndex;
        if (projectile.owner === "player" && botIndex !== undefined) {
          const bot = bots.find((candidate) =>
            candidate.alive && candidate.group.children.some((part) => part.userData.botIndex === botIndex)
          );
          if (bot) applyProjectileDamageToBot(bot, hit);
        }
        removeProjectile(index);
        if (state !== "playing") return;
        continue;
      }
    }

    projectile.mesh.position.copy(end);
    projectile.age += delta;
    if (projectile.age > 1.4 || Math.abs(end.x) > 22 || Math.abs(end.z) > 22 || end.y < -1) {
      removeProjectile(index);
    }
  }
}

function resolvePosition(position, radius) {
  const result = position.clone();
  result.x = THREE.MathUtils.clamp(result.x, -19.2 + radius, 19.2 - radius);
  result.z = THREE.MathUtils.clamp(result.z, -19.2 + radius, 19.2 - radius);

  for (const spec of obstacleSpecs) {
    const halfWidth = spec.w / 2 + radius;
    const halfDepth = spec.d / 2 + radius;
    if (Math.abs(result.x - spec.x) < halfWidth && Math.abs(result.z - spec.z) < halfDepth) {
      const overlapX = halfWidth - Math.abs(result.x - spec.x);
      const overlapZ = halfDepth - Math.abs(result.z - spec.z);
      if (overlapX < overlapZ) result.x = spec.x + Math.sign(result.x - spec.x || 1) * halfWidth;
      else result.z = spec.z + Math.sign(result.z - spec.z || 1) * halfDepth;
    }
  }
  return result;
}

function movePlayer(delta) {
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const movement = new THREE.Vector3();
  if (keys.has("KeyW")) movement.add(forward);
  if (keys.has("KeyS")) movement.sub(forward);
  if (keys.has("KeyD")) movement.add(right);
  if (keys.has("KeyA")) movement.sub(right);
  if (movement.lengthSq() === 0) return;
  movement.normalize().multiplyScalar(player.speed * delta);
  const next = player.position.clone().add(movement);
  const resolved = resolvePosition(next, player.radius);
  if (Math.abs(resolved.x - next.x) > 0.001) resolved.x = player.position.x;
  if (Math.abs(resolved.z - next.z) > 0.001) resolved.z = player.position.z;
  player.position.copy(resolvePosition(resolved, player.radius));
  camera.position.copy(player.position);
}

function moveBots(delta) {
  const playerGround = new THREE.Vector3(player.position.x, 0, player.position.z);
  for (const bot of bots) {
    if (!bot.alive) continue;
    const position = bot.group.position;
    const toPlayer = playerGround.clone().sub(position);
    const distance = toPlayer.length();
    if (distance > 4.8) {
      const direction = toPlayer.normalize();
      const next = position.clone().addScaledVector(direction, 2.1 * delta);
      const resolved = resolvePosition(next, 0.42);
      if (Math.abs(resolved.x - next.x) > 0.01 || Math.abs(resolved.z - next.z) > 0.01) {
        bot.strafeTimer -= delta;
        if (bot.strafeTimer <= 0) {
          bot.strafeDirection *= -1;
          bot.strafeTimer = 1.2;
        }
        const side = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(bot.strafeDirection * 1.7 * delta);
        position.copy(resolvePosition(position.clone().add(side), 0.42));
      } else {
        position.copy(resolved);
      }
    } else {
      bot.strafeTimer -= delta;
      if (bot.strafeTimer <= 0) {
        bot.strafeDirection *= -1;
        bot.strafeTimer = 1.4;
      }
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize()
        .multiplyScalar(bot.strafeDirection * 1.3 * delta);
      position.copy(resolvePosition(position.clone().add(side), 0.42));
    }

    bot.group.rotation.y = Math.atan2(position.x - player.position.x, position.z - player.position.z);
    bot.shotCooldown -= delta;
    if (distance < 16 && bot.shotCooldown <= 0 && hasLineOfSight(bot)) {
      const origin = position.clone().add(new THREE.Vector3(0, 1.12, 0));
      const target = player.position.clone().add(new THREE.Vector3(0, -0.55, 0));
      const direction = target.sub(origin);
      direction.x += (Math.random() - 0.5) * 0.07;
      direction.y += (Math.random() - 0.5) * 0.045;
      direction.z += (Math.random() - 0.5) * 0.07;
      createProjectile(origin, direction, "enemy", 4, 48, 2.5);
      bot.shotCooldown = 2.4 + Math.random() * 1.5;
    }
  }
}

function hasLineOfSight(bot) {
  const origin = bot.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, -0.2, 0));
  const direction = target.sub(origin);
  const distance = direction.length();
  raycaster.set(origin, direction.normalize());
  raycaster.far = distance;
  return raycaster.intersectObjects(obstacleMeshes, false).length === 0;
}

function shoot() {
  if (state !== "playing" || isReloading || performance.now() < nextShotAt) return;
  if (ammo <= 0) {
    showNotice("彈匣已空 · 按 R 重新裝填");
    nextShotAt = performance.now() + 350;
    return;
  }
  ammo -= 1;
  nextShotAt = performance.now() + 220;
  updateHud();

  const direction = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const origin = camera.position.clone()
    .addScaledVector(direction, 0.85)
    .addScaledVector(right, 0.22);
  origin.y -= 0.2;
  createProjectile(origin, direction, "player", 34, 72, 3.2);
}

function reload() {
  if (state !== "playing" || isReloading || ammo === 30 || reserveAmmo === 0) return;
  isReloading = true;
  reloadTimer = 1.25;
  updateHud();
}

function resetRound() {
  clearProjectiles();
  removeBots();
  player.position.set(0, 1.65, 12);
  camera.position.copy(player.position);
  const botCount = 5 + Math.floor(Math.random() * 16);
  createRandomSpawnPositions(botCount).forEach((point, index) => createBot(point.x, point.z, index));
  health = 100;
  ammo = 30;
  reserveAmmo = 90;
  roundTime = 90;
  isReloading = false;
  reloadTimer = 0;
  yaw = 0;
  pitch = 0;
  camera.rotation.set(0, 0, 0);
  updateHud();
}

function endRound(won) {
  if (state !== "playing") return;
  isFiring = false;
  clearProjectiles();
  if (document.pointerLockElement) document.exitPointerLock();
  setState(won ? "won" : "lost");
}

function showPointerLockFailure() {
  overlayCopy.textContent = "瀏覽器拒絕滑鼠控制，請使用桌面瀏覽器並允許此頁面鎖定滑鼠。";
}

function beginRound() {
  if (state === "won" || state === "lost") resetRound();
  try {
    const lockRequest = renderer.domElement.requestPointerLock();
    if (lockRequest && typeof lockRequest.catch === "function") {
      lockRequest.catch(showPointerLockFailure);
    }
  } catch {
    showPointerLockFailure();
  }
}

startButton.addEventListener("click", beginRound);

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === renderer.domElement) {
    setState("playing");
  } else if (state === "playing") {
    isFiring = false;
    keys.clear();
    setState("paused");
  }
});

document.addEventListener("pointerlockerror", () => {
  showPointerLockFailure();
});

document.addEventListener("mousemove", (event) => {
  if (state !== "playing" || document.pointerLockElement !== renderer.domElement) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
  camera.rotation.set(pitch, yaw, 0);
});

document.addEventListener("keydown", (event) => {
  if (state === "playing") keys.add(event.code);
  if (event.code === "KeyR") reload();
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
});

document.addEventListener("keyup", (event) => keys.delete(event.code));
document.addEventListener("mousedown", (event) => {
  if (event.button === 0 && state === "playing") {
    isFiring = true;
    shoot();
  }
});
document.addEventListener("mouseup", (event) => {
  if (event.button === 0) isFiring = false;
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("blur", () => keys.clear());

function update(delta) {
  if (state !== "playing") return;
  movePlayer(delta);
  moveBots(delta);
  if (state !== "playing") return;
  updateProjectiles(delta);
  if (state !== "playing") return;
  if (isFiring) shoot();
  if (isReloading) {
    reloadTimer -= delta;
    if (reloadTimer <= 0) {
      const loaded = Math.min(30, reserveAmmo);
      ammo = loaded;
      reserveAmmo -= loaded;
      isReloading = false;
      updateHud();
    }
  }
  roundTime -= delta;
  if (roundTime <= 0) {
    roundTime = 0;
    updateHud();
    endRound(false);
  } else {
    updateHud();
  }
  noticeTimer -= delta;
  if (noticeTimer <= 0) notice.classList.remove("visible");
  hitMarkerTimer -= delta;
  if (hitMarkerTimer <= 0) hitMarker.classList.remove("active");
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  update(delta);
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetRound();
animate();
