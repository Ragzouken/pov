import GUI from 'lil-gui'
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  IcosahedronGeometry,
  ImageLoader,
  Material,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Stats from 'stats.js'
import { toggleFullScreen } from './helpers/fullscreen'
import { resizeRendererToDisplaySize } from './helpers/responsiveness'
import './style.css'

const CANVAS_ID = 'scene'

let canvas: HTMLElement
let renderer: WebGLRenderer
let scene: Scene
let camera: PerspectiveCamera
let cameraControls: OrbitControls
let stats: Stats
let gui: GUI;
let skybox: Object3D;

let ctx: CanvasRenderingContext2D;
let texture: Texture;
let material: Material;

const frameClock = new Clock();

const raycaster = new Raycaster();
const pointer = new Vector2();

function getNormalisePointer() {
    const norm = new Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    norm.x = ((pointer.x - rect.x) / rect.width ) * 2 - 1;
    norm.y = ((pointer.y - rect.y) / rect.height) * 2 - 1;
    norm.y *= -1;

    return norm;
}

const p0 = new Vector2();
const p1 = new Vector2();

document.addEventListener("pointermove", (event) => {
  pointer.set(event.x, event.y);
});

function saveAs(blob: Blob, name: string) {
    const element = document.createElement("a");
    const url = window.URL.createObjectURL(blob);
    element.href = url;
    element.download = name;
    element.click();
    window.URL.revokeObjectURL(url);
};

async function pickFiles(accept = "*", multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
      const fileInput = document.createElement("input");
      fileInput.setAttribute("type", "file");
      fileInput.setAttribute("multiple", "");
      fileInput.style.visibility = "collapse";
      
      document.body.append(fileInput);
      function done(files) {
          fileInput.remove();
          resolve(files);
      } 

      fileInput.addEventListener("change", () => done(Array.from(fileInput.files)));
      fileInput.addEventListener("cancel", () => done([]));
      fileInput.click();
  });
}

function lineplot(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => undefined) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;

    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) [x0, y0, x1, y1] = [y0, x0, y1, x1];

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const ystep = Math.sign(y1 - y0);
    const xstep = Math.sign(x1 - x0);

    let err = Math.floor(dx / 2);
    let y = y0;

    if (dx === 0 && dy === 0) {
        plot(x0, y0);
    }

    for (let x = x0; x != (x1 + xstep); x += xstep) {
        plot(steep ? y : x, steep ? x : y);
        err -= dy;
        if (err < 0) {
            y += ystep;
            err += dx;
        }
    }
}

function make_skybox(sides: number): BufferGeometry {
  const geometry = new BufferGeometry();

  const v0 = new Vector3();

  const xyz = new Float32Array(3 * sides * 2);

  for (let i = 0; i < sides; ++i) {
    const a = Math.PI * 2 / sides * i;
    const x = Math.cos(a);
    const z = Math.sin(a);
    
    v0.set(x, .5, z);
    v0.toArray(xyz, i * 3);
  }

  for (let i = 0; i < sides; ++i) {
    const a = Math.PI * 2 / sides * i;
    const x = Math.cos(a);
    const z = Math.sin(a);
    
    v0.set(x, .5, z);
    v0.toArray(xyz, i * 3);
  }

  return geometry;
}

const settings = { move: false, dragging: false, color: "#ff0000" };
const size = 256;

init()

function init() {
  // ===== 🖼️ CANVAS, RENDERER, & SCENE =====
  {
    canvas = document.querySelector(`canvas#${CANVAS_ID}`)!
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    scene = new Scene()

    renderer.setAnimationLoop(animate);
  }

  const canvas2 = document.createElement("canvas");
  canvas2.width = size;
  canvas2.height = size;

  ctx = canvas2.getContext("2d")!;

  texture = new Texture(canvas2);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  material = new MeshBasicMaterial({ map: texture, side: BackSide });

  skybox = new Mesh(
    new IcosahedronGeometry(),
    material,
  );
  skybox.scale.set(5, 5, 5);
  skybox.position.set(0, 1, 0);
  scene.add(skybox);

  // ===== 🎥 CAMERA =====
  {
    camera = new PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
    camera.position.set(0, 1, 0)
  }

  // ===== 💡 LIGHTS =====
  {
    camera.add(new DirectionalLight(new Color(), Math.PI));
    scene.add(new AmbientLight(new Color(), .25 * Math.PI));
    scene.add(camera);
  }


  // ===== 🕹️ CONTROLS =====
  {
    cameraControls = new OrbitControls(camera, canvas)
    cameraControls.target.set(0, 1, 0);
    cameraControls.enableDamping = true
    cameraControls.autoRotate = false
    cameraControls.enableZoom = false;
    cameraControls.enablePan = false;
    cameraControls.rotateSpeed = -1;
    cameraControls.update()

    // Full screen
    window.addEventListener('dblclick', (event) => {
      if (event.target === canvas) {
        toggleFullScreen(canvas)
      }
    })
  }

  {
    const loader = new ImageLoader();
    loader.load(new URL("./data/floors2.webp", window.location.href).toString(), (data) => {
      ctx.drawImage(data, 0, 0);

      material.needsUpdate = true;
      texture.needsUpdate = true;
    });

  }

  // ===== 📈 STATS & CLOCK =====
  {
    stats = new Stats()
    document.body.appendChild(stats.dom)
  }

  async function load(files: File[]) {
    const [file] = files;

    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file); 
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = document.createElement("img");
      img.src = url;
      if (img.complete) {
        resolve(img);
      } else {
        img.onload = () => resolve(img);
      }
    });

    ctx.drawImage(img, 0, 0);
    material.needsUpdate = true;
    texture.needsUpdate = true;
  }

  // ==== 🐞 DEBUG GUI ====
  {
    gui = new GUI({ title: '🐞 Debug GUI', width: 300 });
    gui.add(settings, "move");
    gui.addColor(settings, "color");
    gui.add({ export: () => canvas2.toBlob((blob) => saveAs(blob, "scene.png"), "png") }, "export");
    gui.add({ import: () => pickFiles("*.png").then(load) }, "import");
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    settings.dragging = true;
    
    pointer.set(event.x, event.y);
    p0.copy(pointer);
    p1.copy(pointer);
  });

  window.addEventListener("pointerup", (event) => {
    settings.dragging = false;
  });
}

function animate() {
  const dt = Math.min(1/15, frameClock.getDelta());

  stats.begin()

  if (!renderer.xr.isPresenting && resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
  }

  const norm = getNormalisePointer();
  raycaster.setFromCamera(norm, camera);

  const [first] = raycaster.intersectObject(skybox);

  if (first && first.uv && !settings.move && settings.dragging) {
    const x = (2 + first.uv.x) % 1;
    const y = (2 - first.uv.y) % 1;

    p1.set(Math.round(x * size), Math.round(y * size));

    ctx.fillStyle = settings.color;

    const d = p0.distanceTo(p1);

    if (d < 32) {
      lineplot(p0.x, p0.y, p1.x, p1.y, (x, y) => {
        ctx.fillRect(
          x-1, 
          y-1, 
          2, 
          2,
        );
      });
      texture.needsUpdate = true;
      material.needsUpdate = true;
    }
  }

  p0.copy(p1);

  cameraControls.update()
  cameraControls.enabled = settings.move;
  
  renderer.render(scene, camera)
  stats.end()

  // skybox.rotation.y += dt * .25;
}
