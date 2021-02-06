# Use an official Python runtime as a parent image
FROM python:3.9-alpine

# Set the working directory
WORKDIR /opt/fuzzy

# Install base packages
RUN apk --update add bash git make go the_silver_searcher

# Install fzf locally
RUN git clone -b highlight https://github.com/iamlemec/fzf.git
RUN cd fzf && make install

# Install any needed packages specified in requirements.txt
COPY requirements.txt .
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 80 available to the world outside this container
EXPOSE 80

# Copy demo document set
COPY bbc/docs1 docs

# create temp dir
COPY temp temp

# Copy application code
COPY server.py .
COPY static static
COPY templates templates

# Run when the container launches
CMD ["python", "-u", "server.py", "--demo=docs", "--edit", "--path=/data", "--ip=0.0.0.0", "--port=80"]
