import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from '@vercel/speed-insights';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

injectSpeedInsights();
inject()

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        this.policeOfficers = [];
        this.projectiles = [];
        this.isGameOver = false;
        this.isGameStarted = false;
        this.difficulty = null;
        this.pikachuVelocity = new THREE.Vector3(0, 0, 0);
        this.isJumping = false;
        this.jumpForce = 5.0;
        this.gravity = -9.8;
        this.maxJumpHeight = 3.0;
        this.airResistance = 0.1;
        this.groundLevel = 0.8;
        this.verticalVelocity = 0;
        this.isGrounded = true;

        // Kamera takip ayarları
        this.cameraOffset = new THREE.Vector3(0, 10, 20);
        this.cameraLerpFactor = 0.1;
        this.lastMovementDirection = new THREE.Vector3(0, 0, 0); // Son hareket yönü

        // Sonsuz harita için değişkenler
        this.chunkSize = 50; // Her bir harita parçasının boyutu
        this.chunks = new Map(); // Aktif harita parçaları
        this.chunkLoadDistance = 2; // Kaç parça önceden yükleneceği
        this.lastChunkPosition = new THREE.Vector2();

        // Polis spawn ayarları
        this.spawnChance = 0.1;
        this.spawnDistance = 15;
        this.lastSpawnCheck = 0;
        this.spawnCheckInterval = 500;
        this.minPoliceDistance = 5;
        this.policeHeight = 1; // Polislerin yüksekliği

        // Can sistemi
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.lastDamageTime = 0;
        this.healDelay = 5000; // 5 saniye hasar almazsa iyileşmeye başlar
        this.healRate = 0.5; // Her frame'de iyileşme miktarı
        this.healInterval = 100; // Her 100ms'de bir iyileşme
        this.lastHealTime = 0;

        // Çarpışma sistemi için değişkenler
        this.collisionRadius = 1; // Pikachu ve polislerin çarpışma yarıçapı
        this.buildings = []; // Binaların referanslarını tutacak dizi
        this.trees = []; // Ağaçların referanslarını tutacak dizi

        // OrbitControls ekle
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; // Yumuşak hareket için
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5; // Minimum zoom mesafesi
        this.controls.maxDistance = 50; // Maximum zoom mesafesi
        this.controls.maxPolarAngle = Math.PI / 2; // Yatay düzlemin altına geçmeyi engelle
        this.controls.enableZoom = true; // Zoom özelliğini aktif et
        this.controls.enabled = true; // Her zaman aktif olsun

        // Stamina sistemi
        this.maxStamina = 100;
        this.stamina = this.maxStamina;
        this.staminaRegenRate = 1; // Yenilenme hızını artırdım
        this.staminaRegenDelay = 7000; // 7 saniye bekleme süresi
        this.lastStaminaUse = 0;
        this.isExhausted = false;

        // TOMA ayarları
        this.tomaVehicles = [];
        this.tomaSpawnChance = 0.3; // Spawn şansı
        this.tomaSpeed = 0.01; // Polislerden daha yavaş
        this.tomaShootChance = 0.5; // Su atma şansını artırdım (%30'dan %50'ye)
        this.tomaShootDistance = 50; // Atış mesafesini artırdım (40'tan 50'ye)
        this.tomaProjectileSpeed = 0.6; // Mermi hızını artırdım (0.4'ten 0.6'ya)
        this.lastTomaSpawnCheck = 0;
        this.tomaSpawnCheckInterval = 1000;

        this.isPaused = false;

        // Protesto sistemi için yeni değişkenler
        this.protestDuration = 300; // 5 dakika (saniye cinsinden)
        this.remainingTime = this.protestDuration;
        this.citizens = [];
        this.requiredCitizens = 50; // Başarılı bitiş için gereken vatandaş sayısı (25'ten 50'ye çıkardım)
        this.citizenSpawnChance = 0.2; // Vatandaş spawn şansını artırdım (0.1'den 0.2'ye)
        this.lastCitizenSpawnCheck = 0;
        this.citizenSpawnInterval = 500; // Spawn aralığını azalttım (1000'den 500'e)
        this.isProtestSuccessful = false;

        this.setupDifficultyButtons();
        this.init();
    }

    setupDifficultyButtons() {
        const difficulties = ['easy', 'medium', 'hard'];
        difficulties.forEach(diff => {
            document.getElementById(diff).addEventListener('click', () => {
                this.difficulty = diff;
                this.isGameStarted = true;
                document.getElementById('start-screen').style.display = 'none';
                this.startGame();
            });
        });
    }

    startGame() {
        // Zorluk seviyesine göre ayarları yapılandır
        switch(this.difficulty) {
            case 'easy':
                this.policeSpeed = 0.02;
                this.shootChance = 0.005;
                this.projectileSpeed = 0.3;
                this.spawnChance = 0.05; // Kolay modda daha az polis
                this.shootDistance = 30; // Kolay modda daha kısa atış mesafesi
                break;
            case 'medium':
                this.policeSpeed = 0.03;
                this.shootChance = 0.01;
                this.projectileSpeed = 0.4;
                this.spawnChance = 0.1; // Orta modda normal polis
                this.shootDistance = 40; // Orta modda normal atış mesafesi
                break;
            case 'hard':
                this.policeSpeed = 0.04;
                this.shootChance = 0.02;
                this.projectileSpeed = 0.5;
                this.spawnChance = 0.2; // Zor modda daha fazla polis
                this.shootDistance = 50; // Zor modda daha uzun atış mesafesi
                break;
        }
        
        // Vatandaş spawn ayarları - zorluk seviyesinden bağımsız
        this.citizenSpawnChance = 0.2; // Sabit vatandaş spawn şansı
        this.citizenSpawnInterval = 500; // Sabit spawn aralığı

        // Pikachu'nun başlangıç pozisyonunu ayarla
        this.pikachu.position.set(0, 0.8, 0);
        
        // İlk harita parçalarını oluştur
        const initialChunkX = Math.floor(this.pikachu.position.x / this.chunkSize);
        const initialChunkZ = Math.floor(this.pikachu.position.z / this.chunkSize);
        
        // Başlangıç chunk'larını yükle
        for (let x = initialChunkX - this.chunkLoadDistance; x <= initialChunkX + this.chunkLoadDistance; x++) {
            for (let z = initialChunkZ - this.chunkLoadDistance; z <= initialChunkZ + this.chunkLoadDistance; z++) {
                const key = this.getChunkKey(x, z);
                if (!this.chunks.has(key)) {
                    const chunk = this.createCityChunk(x, z);
                    this.chunks.set(key, chunk);
                    this.scene.add(chunk);
                }
            }
        }

        // Son chunk pozisyonunu güncelle
        this.lastChunkPosition.set(initialChunkX, initialChunkZ);

        // Başlangıç polislerini oluştur
        this.createPoliceOfficers();
        
        // İlk vatandaşları oluştur
        for (let i = 0; i < 10; i++) { // Başlangıçta daha fazla vatandaş oluştur (5'ten 10'a)
            this.spawnCitizen();
        }
    }

    init() {
        // Gökyüzü
        const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87CEEB,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.8
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        // Işıklandırma
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        // Pikachu oluşturma
        this.createPikachu();

        // Polis memurları oluşturma
        this.createPoliceOfficers();

        // Kamera pozisyonu
        this.camera.position.set(0, 10, 20);
        this.camera.lookAt(0, 0, 0);

        // İlk harita parçalarını oluştur
        this.updateChunks();

        // Can göstergesi oluştur
        this.createHealthBar();

        // Event listener'ları ekleme
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));

        // Mobil kontroller için event listener'ları ekleme
        this.setupMobileControls();

        // Oyun döngüsünü başlatma
        this.animate();
    }

    setupMobileControls() {
        // Hareket butonları
        const upBtn = document.getElementById('up-btn');
        const downBtn = document.getElementById('down-btn');
        const leftBtn = document.getElementById('left-btn');
        const rightBtn = document.getElementById('right-btn');
        const jumpBtn = document.getElementById('jump-btn');
        
        // Mobil cihaz kontrolü
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // Dokunma olayları
        upBtn.addEventListener('touchstart', () => this.onKeyDown({ key: 'w' }));
        upBtn.addEventListener('touchend', () => this.onKeyUp({ key: 'w' }));
        upBtn.addEventListener('touchcancel', () => this.onKeyUp({ key: 'w' }));

        downBtn.addEventListener('touchstart', () => this.onKeyDown({ key: 's' }));
        downBtn.addEventListener('touchend', () => this.onKeyUp({ key: 's' }));
        downBtn.addEventListener('touchcancel', () => this.onKeyUp({ key: 's' }));

        leftBtn.addEventListener('touchstart', () => this.onKeyDown({ key: 'a' }));
        leftBtn.addEventListener('touchend', () => this.onKeyUp({ key: 'a' }));
        leftBtn.addEventListener('touchcancel', () => this.onKeyUp({ key: 'a' }));

        rightBtn.addEventListener('touchstart', () => this.onKeyDown({ key: 'd' }));
        rightBtn.addEventListener('touchend', () => this.onKeyUp({ key: 'd' }));
        rightBtn.addEventListener('touchcancel', () => this.onKeyUp({ key: 'd' }));

        jumpBtn.addEventListener('touchstart', () => this.onKeyDown({ key: ' ' }));
        jumpBtn.addEventListener('touchend', () => this.onKeyUp({ key: ' ' }));
        jumpBtn.addEventListener('touchcancel', () => this.onKeyUp({ key: ' ' }));
    }

    createCityChunk(chunkX, chunkZ) {
        const chunk = new THREE.Group();
        
        // Yol oluşturma
        const roadGeometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize);
        const roadMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0.1;
        chunk.add(road);

        // Yol çizgileri
        const lineGeometry = new THREE.PlaneGeometry(0.5, this.chunkSize);
        const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.rotation.x = -Math.PI / 2;
        line.position.y = 0.11;
        chunk.add(line);

        // Binalar
        for (let i = 0; i < 5; i++) {
            const building = this.createBuilding();
            building.position.set(
                Math.random() * this.chunkSize - this.chunkSize/2,
                0,
                Math.random() * this.chunkSize - this.chunkSize/2
            );
            chunk.add(building);
            // Binayı buildings dizisine ekle
            this.buildings.push(building);
        }

        // Kaldırımlar
        for (let i = 0; i < 4; i++) {
            const sidewalk = this.createSidewalk();
            sidewalk.position.set(
                Math.random() * this.chunkSize - this.chunkSize/2,
                0.1,
                Math.random() * this.chunkSize - this.chunkSize/2
            );
            chunk.add(sidewalk);
        }

        // Ağaçlar ve çalılar
        for (let i = 0; i < 5; i++) {
            const tree = this.createTree();
            tree.position.set(
                Math.random() * this.chunkSize - this.chunkSize/2,
                0,
                Math.random() * this.chunkSize - this.chunkSize/2
            );
            chunk.add(tree);
        }

        chunk.position.set(chunkX * this.chunkSize, 0, chunkZ * this.chunkSize);
        return chunk;
    }

    createBuilding() {
        const building = new THREE.Group();
        
        // %5 şansla hilalli bina olsun
        const isHealingBuilding = Math.random() < 0.05;
        
        // Bina gövdesi - polislerin boyuna göre daha gerçekçi ölçeklendirme
        const height = 8 + Math.random() * 12; // 8-20 birim arası yükseklik (4-10 kat)
        const width = 4 + Math.random() * 6; // 4-10 birim arası genişlik
        const depth = 4 + Math.random() * 6; // 4-10 birim arası derinlik
        
        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({ 
            color: isHealingBuilding ? 0xff0000 : 0x808080, // Kırmızı veya gri
            roughness: 0.7,
            metalness: 0.3
        });
        const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
        buildingMesh.position.y = height / 2;
        building.add(buildingMesh);

        if (isHealingBuilding) {
            // Hilal ekle
            const crescentGroup = new THREE.Group();
            
            // Hilal texture'ı için düzlem oluştur
            const crescentGeometry = new THREE.PlaneGeometry(width * 0.8, width * 0.8);
            const textureLoader = new THREE.TextureLoader();
            const crescentMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff, // Varsayılan renk
                transparent: true,
                side: THREE.DoubleSide
            });

            // Resmi yükle
            const imagePath = window.location.origin + '/assets/hilal.svg';
            
            textureLoader.load(
                imagePath,
                (texture) => {
                    crescentMaterial.map = texture;
                    crescentMaterial.needsUpdate = true;
                },
                (progress) => {
                },
                (error) => {
                    // Hata durumunda basit bir düz renk kullan
                    crescentMaterial.color = new THREE.Color(0xffffff);
                    crescentMaterial.needsUpdate = true;
                }
            );
            
            // Hilali binanın önüne yerleştir
            const crescent = new THREE.Mesh(crescentGeometry, crescentMaterial);
            
            // Hilali binanın önüne yerleştir
            crescent.position.set(0, height * 0.85, depth/2 + 0.2);
            building.add(crescent);

            // İyileştirme özelliğini ekle
            building.isHealingBuilding = true;
            building.healAmount = 100;
            building.healCooldown = 1000;
            building.lastHealTime = 0;
            building.healingStartTime = 0;
            building.isHealing = false;
            
            // Bina sınırlarını belirle
            building.boundingBox = new THREE.Box3();
            building.boundingBox.setFromObject(buildingMesh);
            
            // Bina boyutlarını kaydet
            building.width = width;
            building.depth = depth;
        } else {
            // Normal binalar için pencereler
            const windowGeometry = new THREE.PlaneGeometry(0.8, 1.2);
            const windowMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xffff00,
                emissive: 0xffff00,
                emissiveIntensity: Math.random()
            });

            // Her katta 3 pencere, toplam 5 kat
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 5; j++) {
                    const window = new THREE.Mesh(windowGeometry, windowMaterial);
                    window.position.set(
                        (i - 1) * 1.2,
                        j * 2.5 + 1.5,
                        depth/2 + 0.1
                    );
                    building.add(window);
                }
            }
        }

        return building;
    }

    createSidewalk() {
        const sidewalkGeometry = new THREE.PlaneGeometry(3, 3);
        const sidewalkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xcccccc,
            roughness: 0.8
        });
        return new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
    }

    createTree() {
        const tree = new THREE.Group();
        
        // Ağaç gövdesi - polislerin boyuna göre daha gerçekçi ölçeklendirme
        const trunkHeight = 4 + Math.random() * 2; // 4-6 birim arası gövde yüksekliği
        const trunkRadius = 0.5 + Math.random() * 0.3; // 0.5-0.8 birim arası gövde yarıçapı
        
        const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2f10 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2; // Gövdeyi yarı yüksekliğinde konumlandır
        tree.add(trunk);

        // Ağaç yaprakları - daha gerçekçi boyut ve şekil
        const leavesRadius = 3 + Math.random() * 2; // 3-5 birim arası yaprak yarıçapı
        const leavesHeight = 4 + Math.random() * 3; // 4-7 birim arası yaprak yüksekliği
        
        const leavesGeometry = new THREE.ConeGeometry(leavesRadius, leavesHeight, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = trunkHeight + leavesHeight * 0.3; // Yaprakları gövdenin üstüne yerleştir
        tree.add(leaves);

        return tree;
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    updateChunks() {
        const currentChunkX = Math.floor(this.pikachu.position.x / this.chunkSize);
        const currentChunkZ = Math.floor(this.pikachu.position.z / this.chunkSize);
        const currentChunkKey = this.getChunkKey(currentChunkX, currentChunkZ);

        // Yeni pozisyon farklı bir chunk'ta mı?
        if (currentChunkKey !== this.getChunkKey(this.lastChunkPosition.x, this.lastChunkPosition.y)) {
            // Yeni chunk'ları yükle
            for (let x = currentChunkX - this.chunkLoadDistance; x <= currentChunkX + this.chunkLoadDistance; x++) {
                for (let z = currentChunkZ - this.chunkLoadDistance; z <= currentChunkZ + this.chunkLoadDistance; z++) {
                    const key = this.getChunkKey(x, z);
                    if (!this.chunks.has(key)) {
                        const chunk = this.createCityChunk(x, z);
                        this.chunks.set(key, chunk);
                        this.scene.add(chunk);

                        // Yeni chunk'ta polis spawn et
                        const chunkCenterX = x * this.chunkSize;
                        const chunkCenterZ = z * this.chunkSize;
                        
                        // Her yeni chunk için 2-3 polis spawn et
                        const policeCount = 2 + Math.floor(Math.random() * 2);
                        for (let i = 0; i < policeCount; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const distance = Math.random() * (this.chunkSize / 2);
                            const spawnX = chunkCenterX + Math.cos(angle) * distance;
                            const spawnZ = chunkCenterZ + Math.sin(angle) * distance;
                            
                            // Diğer polislerden yeterince uzak mı kontrol et
                            let canSpawn = true;
                            for (const officer of this.policeOfficers) {
                                const distanceToOfficer = new THREE.Vector3(spawnX, this.policeHeight, spawnZ)
                                    .distanceTo(officer.position);
                                if (distanceToOfficer < this.minPoliceDistance) {
                                    canSpawn = false;
                                    break;
                                }
                            }

                            if (canSpawn) {
                                const officer = this.createPoliceOfficer(new THREE.Vector3(spawnX, this.policeHeight, spawnZ));
                                // Polise su atma özelliklerini ekle
                                officer.shootChance = this.shootChance;
                                officer.shootDistance = this.shootDistance;
                                officer.projectileSpeed = this.projectileSpeed;
                                officer.lastShootTime = 0;
                                officer.shootCooldown = 1000;
                            }
                        }
                    }
                }
            }

            // Uzak chunk'ları kaldır
            for (const [key, chunk] of this.chunks.entries()) {
                const [chunkX, chunkZ] = key.split(',').map(Number);
                if (Math.abs(chunkX - currentChunkX) > this.chunkLoadDistance || 
                    Math.abs(chunkZ - currentChunkZ) > this.chunkLoadDistance) {
                    this.scene.remove(chunk);
                    this.chunks.delete(key);
                }
            }

            this.lastChunkPosition.set(currentChunkX, currentChunkZ);
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onKeyDown(event) {
        if (this.isGameOver || !this.isGameStarted) return;

        if (event.key === 'Escape') {
            this.togglePause();
            return;
        }

        if (this.isPaused) return;

        const speed = this.isExhausted ? 0.1 : 0.2;
        switch(event.key.toLowerCase()) {
            case 'w':
                this.pikachuVelocity.z = -speed;
                this.lastMovementDirection.set(0, 0, -1);
                break;
            case 's':
                this.pikachuVelocity.z = speed;
                this.lastMovementDirection.set(0, 0, 1);
                break;
            case 'a':
                this.pikachuVelocity.x = -speed;
                this.lastMovementDirection.set(-1, 0, 0);
                break;
            case 'd':
                this.pikachuVelocity.x = speed;
                this.lastMovementDirection.set(1, 0, 0);
                break;
            case ' ':
                if (this.isGrounded && !this.isExhausted) {
                    this.verticalVelocity = this.jumpForce;
                    this.isGrounded = false;
                    this.isJumping = true;
                    this.stamina = Math.max(0, this.stamina - 15);
                    this.lastStaminaUse = Date.now();
                    this.isExhausted = this.stamina <= 0;
                }
                break;
        }
    }

    onKeyUp(event) {
        if (this.isGameOver || !this.isGameStarted) return;

        switch(event.key.toLowerCase()) {
            case 'w':
            case 's':
                this.pikachuVelocity.z = 0;
                break;
            case 'a':
            case 'd':
                this.pikachuVelocity.x = 0;
                break;
        }
    }

    updatePikachu() {
        if (!this.isGameStarted || this.isGameOver) return;

        // Yatay hareket güncellemesi
        this.pikachu.position.x += this.pikachuVelocity.x;
        this.pikachu.position.z += this.pikachuVelocity.z;

        // Dikey hareket ve zıplama güncellemesi
        this.handleJump();

        // Pikachu'nun yönünü hareket yönüne göre ayarla
        if (this.pikachuVelocity.x !== 0 || this.pikachuVelocity.z !== 0) {
            const angle = Math.atan2(this.pikachuVelocity.x, this.pikachuVelocity.z);
            this.pikachu.rotation.y = angle;
        }
    }

    handleJump() {
        const deltaTime = 1/60; // 60 FPS varsayımı

        // Yerçekimi etkisi
        this.verticalVelocity += this.gravity * deltaTime;

        // Hava direnci
        if (!this.isGrounded) {
            this.verticalVelocity *= (1 - this.airResistance * deltaTime);
        }

        // Dikey pozisyonu güncelle
        this.pikachu.position.y += this.verticalVelocity * deltaTime;

        // Yer kontrolü
        if (this.pikachu.position.y <= this.groundLevel) {
            this.pikachu.position.y = this.groundLevel;
            this.verticalVelocity = 0;
            this.isGrounded = true;
            this.isJumping = false;
        }
    }

    createPoliceOfficer(position = null) {
        const group = new THREE.Group();
        
        // Polis memurunun vücudu
        const bodyGeometry = new THREE.BoxGeometry(1, 2, 1);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0000ff,
            roughness: 0.5,
            metalness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Polis memurunun başı
        const headGeometry = new THREE.SphereGeometry(0.4, 32, 32);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.2;
        group.add(head);

        // Polis şapkası
        const hatGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 32);
        const hatMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const hat = new THREE.Mesh(hatGeometry, hatMaterial);
        hat.position.y = 1.5;
        group.add(hat);

        // Polis pozisyonunu ayarla
        if (position) {
            group.position.copy(position);
        } else {
            // Rastgele pozisyon belirle
            const angle = Math.random() * Math.PI * 2;
            const distance = this.spawnDistance + Math.random() * 10;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            group.position.set(x, this.policeHeight, z);
        }

        // Polis özelliklerini ekle
        group.shootChance = this.shootChance;
        group.shootDistance = this.shootDistance;
        group.projectileSpeed = this.projectileSpeed;
        group.lastShootTime = 0;
        group.shootCooldown = 1000;
        group.isPoliceOfficer = true; // Polis memuru olduğunu belirt
        group.health = 100; // Polis memuru için can değeri
        group.takeDamage = function(amount) {
            this.health -= amount;
            return this.health <= 0;
        };

        this.policeOfficers.push(group);
        this.scene.add(group);
        return group;
    }

    createPoliceOfficers() {
        // Başlangıç polislerini oluştur
        for (let i = 0; i < 5; i++) {
            this.createPoliceOfficer();
        }
    }

    spawnNewPoliceOfficer() {
        const currentTime = Date.now();
        
        if (currentTime - this.lastSpawnCheck < this.spawnCheckInterval) {
            return;
        }
        
        this.lastSpawnCheck = currentTime;

        if (Math.random() < this.spawnChance) {
            // Pikachu'nun etrafında rastgele bir açı seç
            const angle = Math.random() * Math.PI * 2;
            
            // Pikachu'dan belirli bir mesafede spawn ol
            const distance = this.spawnDistance + Math.random() * 5;
            const spawnX = this.pikachu.position.x + Math.cos(angle) * distance;
            const spawnZ = this.pikachu.position.z + Math.sin(angle) * distance;
            
            // Diğer polislerden yeterince uzak mı kontrol et
            let canSpawn = true;
            for (const officer of this.policeOfficers) {
                const distanceToOfficer = new THREE.Vector3(spawnX, this.policeHeight, spawnZ)
                    .distanceTo(officer.position);
                if (distanceToOfficer < this.minPoliceDistance) {
                    canSpawn = false;
                    break;
                }
            }

            if (canSpawn) {
                const officer = this.createPoliceOfficer(new THREE.Vector3(spawnX, this.policeHeight, spawnZ));
                // Polise su atma özelliklerini ekle
                officer.shootChance = this.shootChance;
                officer.shootDistance = this.shootDistance;
                officer.projectileSpeed = this.projectileSpeed;
                officer.lastShootTime = 0;
                officer.shootCooldown = 1000;
            }
        }
    }

    updatePoliceOfficers() {
        // Yeni polis spawn etme kontrolü
        this.spawnNewPoliceOfficer();

        this.policeOfficers.forEach(officer => {
            // Pikachu'ya doğru hareket et
            const direction = new THREE.Vector3();
            direction.subVectors(this.pikachu.position, officer.position).normalize();
            
            // Polisi hareket ettir
            officer.position.x += direction.x * this.policeSpeed;
            officer.position.z += direction.z * this.policeSpeed;
            officer.position.y = this.policeHeight;

            // Polisi Pikachu'ya doğru döndür
            officer.lookAt(this.pikachu.position);

            // Pikachu ile polis arasındaki mesafeyi kontrol et
            const distanceToPikachu = officer.position.distanceTo(this.pikachu.position);
            
            // Su sıkma kontrolü - mesafe sınırlaması olmadan
            const currentTime = Date.now();
            if (distanceToPikachu < officer.shootDistance) {
                if (Math.random() < officer.shootChance && 
                    currentTime - officer.lastShootTime > officer.shootCooldown) {
                    // Su atma pozisyonunu polisin üst kısmına ayarla
                    const shootPosition = new THREE.Vector3(
                        officer.position.x,
                        officer.position.y + 1.5,
                        officer.position.z
                    );
                    this.createProjectile(shootPosition, officer.projectileSpeed);
                    officer.lastShootTime = currentTime;
                }
            }
        });
    }

    createProjectile(position, speed = this.projectileSpeed) {
        // Su mermisi için daha büyük ve parlak bir geometri
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.8
        });
        const projectile = new THREE.Mesh(geometry, material);
        projectile.position.copy(position);
        
        // Mermi yönünü ve hızını ayarla
        projectile.velocity = new THREE.Vector3();
        projectile.velocity.subVectors(this.pikachu.position, position).normalize().multiplyScalar(speed);
        
        // Mermiyi Pikachu'ya doğru döndür
        projectile.lookAt(this.pikachu.position);
        
        // Mermiyi sahneye ekle
        this.projectiles.push(projectile);
        this.scene.add(projectile);
        

    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            
            // Mermiyi hareket ettir
            projectile.position.add(projectile.velocity);

            // Çarpışma kontrolü
            if (projectile.position.distanceTo(this.pikachu.position) < 0.3) {
                this.takeDamage(10);
                this.scene.remove(projectile);
                this.projectiles.splice(i, 1);
            }

            // Ekrandan çıkan mermileri silme - mesafeyi çok daha fazla artırdım
            const distanceFromOrigin = projectile.position.distanceTo(new THREE.Vector3(0, 0, 0));
            if (distanceFromOrigin > 1000) { // Mesafeyi 200'den 1000'e çıkardım
                this.scene.remove(projectile);
                this.projectiles.splice(i, 1);
            }
        }
    }

    gameOver() {
        this.isGameOver = true;
        
        // Can barını sıfırla
        this.healthBar.style.width = '0%';
        this.healthBar.style.backgroundColor = '#ff0000';
        
        // Sonuç ekranını göster
        const resultScreen = document.getElementById('result-screen');
        resultScreen.style.display = 'flex';
        resultScreen.classList.add('failure');
        
        // Sonuç mesajlarını ayarla
        document.getElementById('result-message').textContent = 'Oyun Bitti';
        document.getElementById('final-citizens').textContent = `Toplanan Arkadaş: ${this.citizens.length}/${this.requiredCitizens}`;
        document.getElementById('final-time').textContent = 'Süre Doldu!';
        
        // Bitiş açıklaması
        let description = '';
        if (this.health <= 0) {
            description = 'Pikachu başaramadı, tekrar deneyin!';
        } else if (this.citizens.length < this.requiredCitizens) {
            description = 'Yeterli sayıda arkadaş bir araya getirilemedi.';
        }
        document.getElementById('result-description').textContent = description;
    }

    updateCamera() {
        if (!this.isGameStarted || this.isGameOver) return;

        // Pikachu'nun pozisyonunu al
        const targetPosition = this.pikachu.position.clone();
        
        // OrbitControls'un hedefini Pikachu'ya ayarla
        this.controls.target.copy(targetPosition);
        
        // Kamerayı Pikachu'ya doğru yönlendir
        this.camera.lookAt(targetPosition);

        // Eğer etrafa bakma modu aktif değilse, kamerayı sabit tut
        if (!this.controls.enabled) {
            const cameraTarget = targetPosition.clone().add(this.cameraOffset);
            this.camera.position.lerp(cameraTarget, this.cameraLerpFactor);
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        if (this.isGameStarted && !this.isGameOver && !this.isPaused) {
            // Pikachu'nun hareketini güncelle
            this.updatePikachu();
            
            // Polislerin hareketini güncelle
            this.updatePoliceOfficers();
            
            // TOMA'ların hareketini güncelle
            this.updateTOMAVehicles();
            
            // Mermileri güncelle
            this.updateProjectiles();
            
            // Harita parçalarını güncelle
            this.updateChunks();
            
            // Can sistemini güncelle
            this.updateHealth();

            // Stamina sistemini güncelle
            this.updateStamina();

            // Kamerayı güncelle
            this.updateCamera();

            // Vatandaşları güncelle
            this.updateCitizens();
            
            // Protesto durumunu güncelle
            this.updateProtestStatus();
        }

        // OrbitControls'u güncelle
        this.controls.update();

        this.renderer.render(this.scene, this.camera);
    }

    createPikachu() {
        // Pikachu'nun vücudu
        const bodyGeometry = new THREE.SphereGeometry(0.8, 32, 32);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffff00,
            roughness: 0.3,
            metalness: 0.7,
            emissive: 0xffff00,
            emissiveIntensity: 0.2
        });
        this.pikachu = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.pikachu.position.y = 0.8;

        // Pikachu'nun yanakları
        const cheekGeometry = new THREE.SphereGeometry(0.16, 16, 16);
        const cheekMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        
        const leftCheek = new THREE.Mesh(cheekGeometry, cheekMaterial);
        leftCheek.position.set(-0.64, 0.4, 0.64);
        this.pikachu.add(leftCheek);
        
        const rightCheek = new THREE.Mesh(cheekGeometry, cheekMaterial);
        rightCheek.position.set(0.64, 0.4, 0.64);
        this.pikachu.add(rightCheek);

        // Pikachu'nun gözleri
        const eyeGeometry = new THREE.SphereGeometry(0.12, 16, 16);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.32, 0.64, 0.64);
        this.pikachu.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.32, 0.64, 0.64);
        this.pikachu.add(rightEye);

        // Pikachu'nun burnu
        const noseGeometry = new THREE.SphereGeometry(0.08, 16, 16);
        const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.position.set(0, 0.5, 0.7);
        this.pikachu.add(nose);

        // Pikachu'nun ağzı
        const mouthGeometry = new THREE.TorusGeometry(0.15, 0.05, 16, 32, Math.PI);
        const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
        mouth.position.set(0, 0.3, 0.65);
        mouth.rotation.x = Math.PI / 2;
        this.pikachu.add(mouth);

        // Pikachu'nun kulakları
        const earGeometry = new THREE.ConeGeometry(0.2, 1.2, 32);
        const earMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffff00,
            roughness: 0.3,
            metalness: 0.7
        });

        const leftEar = new THREE.Mesh(earGeometry, earMaterial);
        leftEar.position.set(-0.4, 1.2, 0);
        leftEar.rotation.z = -Math.PI / 4;
        this.pikachu.add(leftEar);

        const rightEar = new THREE.Mesh(earGeometry, earMaterial);
        rightEar.position.set(0.4, 1.2, 0);
        rightEar.rotation.z = Math.PI / 4;
        this.pikachu.add(rightEar);

        // Pikachu'nun kuyruğu
        const tailGeometry = new THREE.ConeGeometry(0.16, 1.6, 32);
        const tailMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffff00,
            roughness: 0.3,
            metalness: 0.7
        });
        const tail = new THREE.Mesh(tailGeometry, tailMaterial);
        tail.position.set(0, 0.4, -0.8);
        tail.rotation.x = Math.PI / 4;
        this.pikachu.add(tail);

        // Pikachu'nun bacakları
        const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.6, 16);
        const legMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffff00,
            roughness: 0.3,
            metalness: 0.7
        });

        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.3, 0.1, 0);
        this.pikachu.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.3, 0.1, 0);
        this.pikachu.add(rightLeg);

        // Pikachu'nun kolları
        const armGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 16);
        const armMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffff00,
            roughness: 0.3,
            metalness: 0.7
        });

        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.5, 0.6, 0);
        leftArm.rotation.z = -Math.PI / 4;
        this.pikachu.add(leftArm);

        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.5, 0.6, 0);
        rightArm.rotation.z = Math.PI / 4;
        this.pikachu.add(rightArm);

        this.scene.add(this.pikachu);
    }

    createHealthBar() {
        // Can göstergesi
        const healthBarContainer = document.createElement('div');
        healthBarContainer.style.position = 'fixed';
        healthBarContainer.style.top = '20px';
        healthBarContainer.style.right = '20px';
        healthBarContainer.style.width = '200px';
        healthBarContainer.style.height = '20px';
        healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        healthBarContainer.style.borderRadius = '10px';
        healthBarContainer.style.overflow = 'hidden';
        healthBarContainer.style.zIndex = '100';

        const healthBar = document.createElement('div');
        healthBar.style.width = '100%';
        healthBar.style.height = '100%';
        healthBar.style.backgroundColor = '#ff0000';
        healthBar.style.transition = 'width 0.3s ease';
        healthBarContainer.appendChild(healthBar);

        // Kalp ikonu
        const heartIcon = document.createElement('div');
        heartIcon.innerHTML = '❤️';
        heartIcon.style.position = 'absolute';
        heartIcon.style.left = '5px';
        heartIcon.style.top = '2px';
        heartIcon.style.fontSize = '14px';
        healthBarContainer.appendChild(heartIcon);

        // Stamina göstergesi (sol alta taşındı)
        const staminaBarContainer = document.createElement('div');
        staminaBarContainer.style.position = 'fixed';
        staminaBarContainer.style.bottom = '20px';
        staminaBarContainer.style.left = '20px';
        staminaBarContainer.style.width = '200px';
        staminaBarContainer.style.height = '20px';
        staminaBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        staminaBarContainer.style.borderRadius = '10px';
        staminaBarContainer.style.overflow = 'hidden';
        staminaBarContainer.style.zIndex = '100';

        const staminaBar = document.createElement('div');
        staminaBar.style.width = '100%';
        staminaBar.style.height = '100%';
        staminaBar.style.backgroundColor = '#00ff00';
        staminaBar.style.transition = 'width 0.3s ease';
        staminaBarContainer.appendChild(staminaBar);

        // Yıldırım ikonu
        const lightningIcon = document.createElement('div');
        lightningIcon.innerHTML = '⚡';
        lightningIcon.style.position = 'absolute';
        lightningIcon.style.left = '5px';
        lightningIcon.style.top = '2px';
        lightningIcon.style.fontSize = '14px';
        staminaBarContainer.appendChild(lightningIcon);

        document.body.appendChild(healthBarContainer);
        document.body.appendChild(staminaBarContainer);
        this.healthBar = healthBar;
        this.staminaBar = staminaBar;
    }

    updateHealth() {
        const currentTime = Date.now();

        // Hasar alma kontrolü
        this.policeOfficers.forEach(officer => {
            const distance = officer.position.distanceTo(this.pikachu.position);
            if (distance < 1) {
                this.takeDamage(1);
            }
        });

        // İyileştirici binalarla etkileşim kontrolü
        this.buildings.forEach(building => {
            if (building.isHealingBuilding) {
                // Binanın dünya pozisyonunu al
                const buildingWorldPos = new THREE.Vector3();
                building.getWorldPosition(buildingWorldPos);
                
                // Pikachu'nun bina içinde olup olmadığını kontrol et
                const pikachuRelativeX = Math.abs(this.pikachu.position.x - buildingWorldPos.x);
                const pikachuRelativeZ = Math.abs(this.pikachu.position.z - buildingWorldPos.z);
                const isInside = pikachuRelativeX < building.width/2 && pikachuRelativeZ < building.depth/2;

                if (isInside) {
                    if (!building.isHealing) {
                        // Pikachu yeni girdi, zamanı başlat
                        building.healingStartTime = currentTime;
                        building.isHealing = true;
                    } else if (currentTime - building.healingStartTime >= 1000) { // 1 saniye durdu mu?
                        // 1 saniye durdu, canı doldur
                        this.health = this.maxHealth;
                        building.isHealing = false;
                    }
                } else {
                    // Pikachu binadan çıktı
                    building.isHealing = false;
                }
            }
        });

        // Can göstergesini güncelle
        const healthPercent = (this.health / this.maxHealth) * 100;
        this.healthBar.style.width = `${healthPercent}%`;
        this.healthBar.style.backgroundColor = this.getHealthColor(healthPercent);
    }

    getHealthColor(percent) {
        if (percent > 60) return '#00ff00';
        if (percent > 30) return '#ffff00';
        return '#ff0000';
    }

    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        this.lastDamageTime = Date.now();

        // Can göstergesini hemen güncelle
        const healthPercent = (this.health / this.maxHealth) * 100;
        this.healthBar.style.width = `${healthPercent}%`;
        this.healthBar.style.backgroundColor = this.getHealthColor(healthPercent);

        if (this.health === 0) {
            this.gameOver();
        }
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    updateStamina() {
        const currentTime = Date.now();
        const isJumping = this.isJumping;

        // Stamina yenilenmesi
        if (!isJumping && currentTime - this.lastStaminaUse > this.staminaRegenDelay) {
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate);
            if (this.stamina > 20) { // Stamina %20'nin üzerine çıkınca yorgunluk kalkar
                this.isExhausted = false;
                // Stamina yenilendiğinde hızı normal haline döndür
                if (this.pikachuVelocity.x !== 0) {
                    this.pikachuVelocity.x = this.pikachuVelocity.x > 0 ? 0.2 : -0.2;
                }
                if (this.pikachuVelocity.z !== 0) {
                    this.pikachuVelocity.z = this.pikachuVelocity.z > 0 ? 0.2 : -0.2;
                }
            }
        }

        // Stamina göstergesini güncelle
        const staminaPercent = (this.stamina / this.maxStamina) * 100;
        this.staminaBar.style.width = `${staminaPercent}%`;
        this.staminaBar.style.backgroundColor = this.getStaminaColor(staminaPercent);
    }

    getStaminaColor(percent) {
        if (percent > 60) return '#00ff00';
        if (percent > 30) return '#ffff00';
        return '#ff0000';
    }

    createTOMAVehicle(position = null) {
        const group = new THREE.Group();
        
        // TOMA gövdesi
        const bodyGeometry = new THREE.BoxGeometry(3, 2, 4);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0000ff,
            roughness: 0.5,
            metalness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // TOMA tekerlekleri
        const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        
        const wheelPositions = [
            [-1, -0.5, 1.5],
            [1, -0.5, 1.5],
            [-1, -0.5, -1.5],
            [1, -0.5, -1.5]
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(...pos);
            wheel.rotation.z = Math.PI / 2;
            group.add(wheel);
        });

        // TOMA su sıkma borusu
        const nozzleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const nozzleMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
        nozzle.position.set(0, 1, 2);
        group.add(nozzle);

        // TOMA pozisyonunu ayarla
        if (position) {
            group.position.copy(position);
        } else {
            // Rastgele pozisyon belirle
            const angle = Math.random() * Math.PI * 2;
            const distance = this.spawnDistance + Math.random() * 10;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            group.position.set(x, this.policeHeight, z);
        }

        // TOMA özelliklerini ekle
        group.shootChance = this.tomaShootChance;
        group.shootDistance = this.tomaShootDistance;
        group.projectileSpeed = this.tomaProjectileSpeed;
        group.lastShootTime = 0;
        group.shootCooldown = 2000;
        group.isTOMA = true; // TOMA olduğunu belirt
        group.health = 200; // TOMA için can değeri
        group.takeDamage = function(amount) {
            this.health -= amount;
            return this.health <= 0;
        };

        this.tomaVehicles.push(group);
        this.scene.add(group);
        return group;
    }

    spawnNewTOMA() {
        const currentTime = Date.now();
        
        if (currentTime - this.lastTomaSpawnCheck < this.tomaSpawnCheckInterval) {
            return;
        }
        
        this.lastTomaSpawnCheck = currentTime;

        // Skor kontrolünü kaldırdım, TOMA'lar her zaman spawn olabilir
            if (Math.random() < this.tomaSpawnChance) {
                // Pikachu'nun etrafında rastgele bir açı seç
                const angle = Math.random() * Math.PI * 2;
                
                // Pikachu'dan belirli bir mesafede spawn ol
                const distance = this.spawnDistance + Math.random() * 5;
                const spawnX = this.pikachu.position.x + Math.cos(angle) * distance;
                const spawnZ = this.pikachu.position.z + Math.sin(angle) * distance;
                
                // Diğer TOMA'lardan yeterince uzak mı kontrol et
                let canSpawn = true;
                for (const toma of this.tomaVehicles) {
                    const distanceToTOMA = new THREE.Vector3(spawnX, this.policeHeight, spawnZ)
                        .distanceTo(toma.position);
                    if (distanceToTOMA < this.minPoliceDistance * 2) {
                        canSpawn = false;
                        break;
                    }
                }

                if (canSpawn) {
                    this.createTOMAVehicle(new THREE.Vector3(spawnX, this.policeHeight, spawnZ));
            }
        }
    }

    updateTOMAVehicles() {
        // Yeni TOMA spawn etme kontrolü
        this.spawnNewTOMA();

        this.tomaVehicles.forEach(toma => {
            // Pikachu'ya doğru hareket et
            const direction = new THREE.Vector3();
            direction.subVectors(this.pikachu.position, toma.position).normalize();
            
            // TOMA'yı hareket ettir
            toma.position.x += direction.x * this.tomaSpeed;
            toma.position.z += direction.z * this.tomaSpeed;
            toma.position.y = this.policeHeight;

            // TOMA'yı Pikachu'ya doğru döndür
            toma.lookAt(this.pikachu.position);

            // Pikachu ile TOMA arasındaki mesafeyi kontrol et
            const distanceToPikachu = toma.position.distanceTo(this.pikachu.position);
            
            // Su sıkma kontrolü
            const currentTime = Date.now();
           

            if (distanceToPikachu < toma.shootDistance && currentTime - toma.lastShootTime >= toma.shootCooldown) {
                // Su atma pozisyonunu TOMA'nın üst kısmına ayarla
                const shootPosition = new THREE.Vector3(
                    toma.position.x,
                    toma.position.y + 1.5,
                    toma.position.z
                );
                this.createProjectile(shootPosition, toma.projectileSpeed);
                toma.lastShootTime = currentTime;
            }
        });
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        
        // Duraklatma menüsünü göster/gizle
        const pauseMenu = document.getElementById('pause-menu');
        if (this.isPaused) {
            pauseMenu.style.display = 'flex';
        } else {
            pauseMenu.style.display = 'none';
        }
    }

    updateProtestStatus() {
        if (!this.isGameStarted || this.isGameOver || this.isPaused) return;
        
        // Kalan süreyi güncelle
        this.remainingTime = Math.max(0, this.remainingTime - 1/60); // 60 FPS varsayımı
        
        // Süre bittiyse veya yeterli vatandaş toplandıysa oyunu bitir
        if (this.remainingTime <= 0 || this.citizens.length >= this.requiredCitizens) {
            if (this.citizens.length >= this.requiredCitizens) {
                this.protestSuccess();
            } else {
                this.gameOver();
            }
        }
        
        // Vatandaş spawn etme kontrolü
        const currentTime = Date.now();
        if (currentTime - this.lastCitizenSpawnCheck >= this.citizenSpawnInterval) {
            this.lastCitizenSpawnCheck = currentTime;
           
            
            if (Math.random() < this.citizenSpawnChance) {
                this.spawnCitizen();
                
                // Yeterli vatandaş toplandıysa oyunu başarılı bir şekilde bitir
                if (this.citizens.length >= this.requiredCitizens) {
                    this.protestSuccess();
                }
            }
        }
        
        // UI güncellemesi
        this.updateProtestUI();
    }
    
    spawnCitizen() {
        const citizen = new THREE.Group();
        
        // Vatandaş modeli
        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.8, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x808080,
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        citizen.add(body);
        
        // Baş
        const headGeometry = new THREE.SphereGeometry(0.4, 32, 32);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.1;
        citizen.add(head);
        
        // Vatandaş yazısı için canvas oluştur
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        // Arka planı temizle
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Yazıyı ayarla
        context.font = 'bold 32px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('Arkadaş', canvas.width / 2, canvas.height / 2);
        
        // Canvas'ı texture'a dönüştür
        const texture = new THREE.CanvasTexture(canvas);
        
        // Vatandaş yazısı için düzlem
        const textGeometry = new THREE.PlaneGeometry(2, 0.5);
        const textMaterial = new THREE.MeshBasicMaterial({ 
            map: texture,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const textPlane = new THREE.Mesh(textGeometry, textMaterial);
        textPlane.position.y = 2.2;
        textPlane.rotation.x = -Math.PI / 4; // Yazıyı hafif eğik göster
        citizen.add(textPlane);
        
        // Pikachu'nun etrafında rastgele bir konumda spawn et
        const angle = Math.random() * Math.PI * 2;
        const distance = 5 + Math.random() * 5;
        
        // Pikachu'nun mevcut chunk'ını bul
        const currentChunkX = Math.floor(this.pikachu.position.x / this.chunkSize);
        const currentChunkZ = Math.floor(this.pikachu.position.z / this.chunkSize);
        
        // Chunk'ın merkez noktasını hesapla
        const chunkCenterX = currentChunkX * this.chunkSize + this.chunkSize / 2;
        const chunkCenterZ = currentChunkZ * this.chunkSize + this.chunkSize / 2;
        
        // Vatandaşı chunk'ın merkez noktası etrafında spawn et
        const x = chunkCenterX + Math.cos(angle) * distance;
        const z = chunkCenterZ + Math.sin(angle) * distance;
        citizen.position.set(x, 0.9, z);
        
        // Vatandaş özellikleri
        citizen.isCitizen = true;
        citizen.health = 50;
        citizen.speed = 0.05; // Vatandaşların hareket hızı
        citizen.followDistance = 3 + Math.random() * 2; // Takip mesafesi
        citizen.textPlane = textPlane; // Yazı düzlemini referans olarak sakla
        
        // Vatandaş yazısını kameraya döndür
        this.updateCitizenText(citizen);
        
        this.citizens.push(citizen);
        this.scene.add(citizen);
    }
    
    updateCitizens() {
        this.citizens.forEach(citizen => {
            // Pikachu'ya olan mesafeyi hesapla
            const distanceToPikachu = citizen.position.distanceTo(this.pikachu.position);
            
            // Eğer takip mesafesinden uzaksa, Pikachu'ya doğru hareket et
            if (distanceToPikachu > citizen.followDistance) {
                const direction = new THREE.Vector3();
                direction.subVectors(this.pikachu.position, citizen.position).normalize();
                
                // Yatay düzlemde hareket et (y pozisyonunu değiştirme)
                citizen.position.x += direction.x * citizen.speed;
                citizen.position.z += direction.z * citizen.speed;
                
                // Vatandaşı Pikachu'ya doğru döndür
                const angle = Math.atan2(direction.x, direction.z);
                citizen.rotation.y = angle;
            }
            
            // Vatandaş yazısını kameraya döndür
            this.updateCitizenText(citizen);
            
            // Vatandaş Pikachu'ya çok yakınsa, vatandaşı topla
            if (distanceToPikachu < 2) {
                // Vatandaşı listeden kaldır
                const index = this.citizens.indexOf(citizen);
                if (index !== -1) {
                    this.citizens.splice(index, 1);
                    this.scene.remove(citizen);
                    
                    // Yeni bir vatandaş spawn et
                    this.spawnCitizen();
                    }
                }
            });
    }
    
    updateCitizenText(citizen) {
        // Yazı düzlemini kameraya döndür
        citizen.textPlane.lookAt(this.camera.position);
        
        // Yazı düzlemini biraz daha yukarı kaldır
        citizen.textPlane.position.y = 2.2;
    }
    
    updateProtestUI() {
        // Süre göstergesi
        const minutes = Math.floor(this.remainingTime / 60);
        const seconds = Math.floor(this.remainingTime % 60);
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Vatandaş sayısı göstergesi
        const citizenText = `Arkadaşlar: ${this.citizens.length}/${this.requiredCitizens}`;
        
        // UI elementlerini güncelle
        document.getElementById('score').textContent = `Kalan Süre: ${timeText}`;
        document.getElementById('citizen-count').textContent = citizenText;
    }
    
    protestSuccess() {
        this.isProtestSuccessful = true;
        this.isGameOver = true;
        
        // Sonuç ekranını göster
        const resultScreen = document.getElementById('result-screen');
        resultScreen.style.display = 'flex';
        resultScreen.classList.add('success');
        
        // Sonuç mesajlarını ayarla
        document.getElementById('result-message').textContent = 'Tebrikler!';
        document.getElementById('final-citizens').textContent = `Toplanan Arkadaş: ${this.citizens.length}/${this.requiredCitizens}`;
        document.getElementById('final-time').textContent = 'Süre Doldu!';
        
        // Başarılı bitiş açıklaması
        const description = 'Pikachu ve arkadaşları güzel bir gün geçirdi!';
        document.getElementById('result-description').textContent = description;
        
        // Başlığı pulse animasyonu ile vurgula
        document.querySelector('#result-screen h1').classList.add('pulse');
    }
}

// Oyunu başlat
new Game(); 