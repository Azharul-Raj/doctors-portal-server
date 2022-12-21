const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require('jsonwebtoken');
const { query } = require("express");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_TEST_SECRET);


const app = express();
// middleware
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server is running ${port}`);
});

app.get("/", (req, res) => {
  res.send("SERVER IS UP AND RUNNING");
});

const verifyJWT = (req,res,next) => {
  const authHead = req.headers.authorization;
  if (!authHead) {
    return res.status(401).send('INVALID USER');
  }
  const token = authHead.split(' ')[1];
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
        return res.status(402).send('UNAUTHORIZED USER')
    }
    req.data = decoded;
    next()
  })
}
// verify admin middleware
const verifyAdmin = async (req, res, next) => {
  const { email } = req.data;
  const query = { email };
  const result = await users.findOne(query);
  // console.log(result);
  if (result) {
    res.send({isAdmin:result?.role==='admin'})    
  }
  next();
}

// const uri='mongodb://localhost:27017'
// const client = new MongoClient(uri);
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dnsrj7s.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const dbConnect = async () => {
  try {
    client.connect();
    console.log("connected");
  } catch (err) {
    console.log(err);
  }
};
dbConnect();
const appointmentServices = client.db("doctorsportal").collection("services");
const appointmentBookings = client.db("doctorsportal").collection("bookings");
const doctorsList = client.db("doctorsportal").collection("doctors");
const paymentsList = client.db("doctorsportal").collection("payments");
const users = client.db("doctorsportal").collection("users");

app.get("/services", async (req, res) => {
  try {
    const date = req.query.date;
    const bookingQuery = { appointmentDate: date };
    const services = await appointmentServices.find({}).toArray();
    const alreadyBooked = await appointmentBookings
      .find(bookingQuery)
      .toArray();
    services.forEach((service) => {
      const serviceBooked = alreadyBooked.filter(
        (book) => book.sickness === service.name
      );
      const bookedSlots = serviceBooked.map((service) => service.slot);
      const remainingSlots = service.slots.filter(
        (slot) => !bookedSlots.includes(slot)
      );
      service.slots = remainingSlots;
    });
    res.send(services);
  } catch (err) {
    res.send(err.message);
  }
});

app.post('/services', async (req, res) => {
  const service = req.body;
  const result = appointmentServices.insertOne(service);
  res.send(result);
})
app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;
    const query = { appointmentDate: booking.appointmentDate, email: booking.email, sickness: booking.sickness }
    const isBooked = await appointmentBookings.find(query).toArray();
    if (isBooked.length) {
      return res.send({acknowledged:false,message:`You already have booking for ${booking.sickness}` })
    }
    else {
      const result = await appointmentBookings.insertOne(booking);
      return res.send(result);      
    }
  } catch (err) {
    res.send(err.message);
  }
});

app.get('/bookings',verifyJWT, async (req, res) => {
  const decoded = req.data;
  const email = req.query.email;
  if (email !== decoded.email) {
    return res.status(403).send('Invalid Email')
  }
  else {
    const query = { email: email };
    const userBookings =await appointmentBookings.find(query).toArray();
    return res.send(userBookings);
    
  }
})
// booking getting api
app.get('/booking/:id', async (req, res) => {
  const { id } = req.params;
  const query = { _id: ObjectId(id) };
  const booking = await appointmentBookings.findOne(query);
  res.send(booking);
})

// post user api
app.post('/users', async (req, res) => {
  const userInfo = req.body;
  const name = req.query.name;
  const query = { name: name };
  const isExist = users.find(query).toArray();
  if ((await isExist).length) {
    return res.send({ isExist: true });
  }
  else {
    const result = await users.insertOne(userInfo);
    return res.send(result);    
  }
})

// get user api
app.get('/users', async (req, res) => {
  const allUsers =await users.find({}).toArray();
  res.send(allUsers);
})
// update user api
app.put('/user/admin/:id', async (req, res) => {
  const { id } = req.params;
  const filter = { _id: ObjectId(id) };
  const option = { upsert: true };
  const updateDoc = {
    $set: {
      role:"admin"
    }
  }
  const result = await users.updateOne(filter, updateDoc, option);
  res.send(result);
})
// get admin api
app.get('/user/admin/:email', async (req, res) => {
  const { email } = req.params;
  const query = { email };
  const result = await users.findOne(query);
  if (result) {
    res.send({isAdmin:result?.role==='admin'})    
  }
})
// user delete api
app.delete('/user/:id',verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const query = { _id: ObjectId(id) };
  const result = await users.deleteOne(query);
  res.send(result);
})

// doctors role getting api
app.get('/specialists', async (req, res) => {
  const specialists = await appointmentServices.find({}).project({ name: 1 }).toArray();
  res.send(specialists);
})
// doctor adding api
app.post('/add_doctor',verifyAdmin, async (req, res) => {
  const doctor = req.body;
  const result = await doctorsList.insertOne(doctor);
  res.send(result);
})
// all doctors getting api
app.get('/doctors', async (req, res) => {
  const doctors = await doctorsList.find({}).toArray();
  res.send(doctors);
})
// delete doctor api
app.delete('/doctor/:id',verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const query = { _id: ObjectId(id) };
  const result = await doctorsList.deleteOne(query);
  res.send(result);
})
// web token getting function
app.get('/jwt', async (req, res) => {
  const email = req.query.email;
    const token = jwt.sign({ email: email }, process.env.SECRET_KEY, { expiresIn: '1d' })
    return res.send({ token: token });  
})
// stripe payment api
app.post("/create-payment-intent", async (req, res) => { 
  const booking = req.body;
  const price = booking.price;
  const amount = price * 100;
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency:'usd'
  })
  res.send({
    clientSecret: paymentIntent.client_secret,
  });
})
// payment confirm api
app.post('/payment', async (req, res) => {
  const paymentInfo = req.body;
  const id = paymentInfo.bookingID;
  const result = await paymentsList.insertOne(paymentInfo);
  const filter = { _id: ObjectId(id) };
  const updateDoc = {
    $set: {
      paid:true
    }
  }
  const updateResult = await appointmentBookings.updateOne(filter, updateDoc);
  res.send({result,updateResult})
})